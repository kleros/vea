// Runs Claude Code in print mode with a JSON schema and a hard timeout. Uses the
// operator's ordinary login: ANTHROPIC_API_KEY is stripped from the child env so
// the run can never fall through to API-key billing.
import { spawn } from "node:child_process";
import { KEYS } from "./spec.mjs";
import { isValidAddress } from "./keccak.mjs";

export const OUTPUT_SCHEMA = {
  type: "object",
  required: ["entries", "unresolved"],
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        required: ["key", "value", "chainId", "sourceKind", "sourceRef"],
        properties: {
          key: { type: "string" },
          value: { type: "string" },
          chainId: { type: "integer" },
          sourceKind: { type: "string", enum: ["repo", "registry", "docs"] },
          sourceRef: { type: "string", description: "exact URL or repo-relative file path the value was read from" },
          note: { type: "string" },
        },
      },
    },
    unresolved: {
      type: "array",
      items: {
        type: "object",
        required: ["key", "reason"],
        properties: { key: { type: "string" }, reason: { type: "string" } },
      },
    },
  },
};

export function buildPrompt({ source, target, bridges, veaNetwork, keys, config, extractPath }) {
  const lines = keys.map((k) => {
    const s = KEYS[k];
    const chain = s.side === "reporter" ? source : target;
    return `- ${k}: ${s.type} on chain ${chain} (${s.side} side, bridge "${s.group}")`;
  });
  return `You are preparing a Veashi (Hashi) route deployment for reporter/source chain ${source} -> adapter/target chain ${target} with bridges: ${bridges.join(
    ", "
  )}.
Resolve the following .env keys for veashi-contracts/script/deploy-route.sh. Read-only research; do not modify files.

${lines.join("\n")}

Start by reading ${extractPath}: a per-route extract of the official registries below for chains ${source} and ${target}, written by this tool because the full registries are too large for the fetch tool. Registry values (LayerZero, CCIP, Axelar, deBridge chain id) MUST be taken from this extract; cite the \`url\` recorded next to them, never the extract path. Web fetching is only allowed for the deBridge gate documentation. If the extract lacks a chain, report the key as unresolved.

Where to look (only these sources are trusted; never invent, guess, or copy from .env.example):
- Vea inbox/outbox: contracts/deployments/<network>/*.json (check the .chainId file in each directory; use the "${veaNetwork}" flavour: VeaInbox*${
    veaNetwork[0].toUpperCase() + veaNetwork.slice(1)
  }.json on the source chain and the matching VeaOutbox* file on the target chain).
- Hashi Yaho/Yaru for this route: veashi-contracts/broadcast/${source}-${target}.json
- LayerZero endpoint V2, EIDs, SendUln302 (send lib), ReceiveUln302 (receive lib), Executor: ${
    config.layerzero.url
  } (JSON; find the chain whose chainDetails.nativeChainId matches, use the version 2 deployment). LZ_SEND_LIB and LZ_EXECUTOR are for the reporter chain; LZ_RECEIVE_LIB is for the adapter chain.
- CCIP chain selectors: ${config.ccip.selectors}; CCIP routers: ${config.ccip.mainnet} and ${
    config.ccip.testnet
  } (keyed by the chain name from the selectors file).
- Axelar gateway, gas service and chain names (use the exact axelarId): ${config.axelar.mainnet} and ${
    config.axelar.testnet
  }
- deBridge chain id for the reporter chain (deBridge's own id; differs from the EVM chain id on some chains, e.g. Story is 100000013): ${
    config.debridge.chains
  } (field chainId where originalChainId matches).
- deBridge DeBridgeGate address on each chain: ${config.debridge.docs} (cite the exact page you read).

Rules:
- Every entry must cite the exact URL or repo-relative path it came from in sourceRef.
- If a value cannot be found in these sources, list the key under "unresolved" with the reason instead of guessing.
- Return only the structured output.`;
}

function filteredEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (/KEY|SECRET|TOKEN|PASSWORD|PRIVATE|_RPC$|^RPC_/i.test(k) && !/^CLAUDE_CONFIG_DIR$/.test(k)) continue;
    out[k] = v;
  }
  return out;
}

export function runAgent({
  prompt,
  timeoutMs,
  model,
  cwd,
  domains,
  addDirs = [],
  claudeBin = "claude",
  spawnImpl = spawn,
  env = process.env,
}) {
  const allowed = ["Read", "Grep", "Glob", ...domains.map((d) => `WebFetch(domain:${d})`)];
  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(OUTPUT_SCHEMA),
    "--tools",
    "Read,Grep,Glob,WebFetch",
    "--allowedTools",
    ...allowed,
    "--disallowedTools",
    "Bash,Edit,Write,MultiEdit,NotebookEdit,WebSearch",
    "--permission-mode",
    "dontAsk",
    "--permission-prompts",
    "none",
    "--no-session-persistence",
  ];
  if (model) args.push("--model", model);
  if (addDirs.length) args.push("--add-dir", ...addDirs);
  return new Promise((resolve, reject) => {
    const child = spawnImpl(claudeBin, args, { cwd, env: filteredEnv(env), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`could not start ${claudeBin}: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error(`agent timed out after ${timeoutMs / 1000}s`));
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        return reject(
          new Error(`agent exited ${code} with non-JSON output: ${stderr.slice(0, 500) || stdout.slice(0, 500)}`)
        );
      }
      const meta = {
        sessionId: parsed.session_id,
        subtype: parsed.subtype,
        numTurns: parsed.num_turns,
        durationMs: parsed.duration_ms,
        costUsd: parsed.total_cost_usd,
        exitCode: code,
      };
      if (parsed.is_error || parsed.subtype !== "success" || !parsed.structured_output)
        return reject(
          Object.assign(
            new Error(`agent did not succeed (${parsed.subtype}): ${String(parsed.result ?? "").slice(0, 500)}`),
            { meta }
          )
        );
      resolve({ structured: parsed.structured_output, meta });
    });
  });
}

/** Shape-check the agent's answer; returns entries keyed by KEY plus a list of problems. */
export function validateAgentOutput(structured, keys) {
  const errors = [];
  const entries = {};
  for (const e of structured.entries ?? []) {
    if (!keys.includes(e.key)) continue; // extra keys are ignored, never published
    if (entries[e.key]) errors.push(`${e.key}: returned more than once`);
    const t = KEYS[e.key].type;
    const v = String(e.value).trim();
    if (t === "address" && !isValidAddress(v)) errors.push(`${e.key}: "${v}" is not a valid (checksummed) address`);
    if (t === "uint" && !/^\d+$/.test(v)) errors.push(`${e.key}: "${v}" is not an unsigned integer`);
    if (t === "string" && !v) errors.push(`${e.key}: empty string`);
    if (!/^(https?:\/\/|[\w./-]+\.json)/.test(e.sourceRef))
      errors.push(`${e.key}: sourceRef "${e.sourceRef}" is neither a URL nor a repo json path`);
    entries[e.key] = { value: v, chainId: e.chainId, sourceKind: e.sourceKind, sourceRef: e.sourceRef, note: e.note };
  }
  for (const u of structured.unresolved ?? [])
    if (keys.includes(u.key)) errors.push(`${u.key}: unresolved by agent: ${u.reason}`);
  for (const k of keys)
    if (!entries[k] && !errors.some((m) => m.startsWith(`${k}:`))) errors.push(`${k}: missing from agent output`);
  return { entries, errors };
}

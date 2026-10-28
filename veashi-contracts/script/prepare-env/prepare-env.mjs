#!/usr/bin/env node
// prepare-env: build a verified, deployment-ready .env for one Veashi route.
//
//   node script/prepare-env/prepare-env.mjs --source 42161 --target 1514 --bridges lz,ccip,debridge
//
// Asks Claude Code (ordinary login, print mode, JSON schema) for the addresses
// with citations, then re-resolves every value from the repo records and the
// official registries in registries.json, checks chain ids, bytecode and
// identity getters over RPC, and only then writes deploy-config/<src>-<dst>.env
// and <src>-<dst>.report.json atomically. Any failure leaves previous output
// untouched, writes <src>-<dst>.failed.report.json and exits non-zero.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { agentKeys, parseBridges } from "./lib/spec.mjs";
import { createRpc, redactUrl } from "./lib/rpc.mjs";
import { extractForAgent, loadRegistries, resolveTrusted, sha256 } from "./lib/records.mjs";
import { buildPrompt, runAgent, validateAgentOutput } from "./lib/agent.mjs";
import { verify } from "./lib/verify.mjs";
import { inputVersion, parseEnv, renderEnv, writeAtomic } from "./lib/env.mjs";

const TOOL = "veashi-prepare-env";
const VERSION = "1";
const EXIT = { ok: 0, usage: 1, agent: 2, verification: 3, publish: 4 };
const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..", "..");
const repoRoot = path.resolve(pkgRoot, "..");
const log = (msg) => process.stderr.write(`[prepare-env] ${msg}\n`);

const USAGE = `Usage: node script/prepare-env/prepare-env.mjs --source <chainId> --target <chainId> --bridges <vea,lz,ccip,debridge,axelar[,hashi]>
       [--vea-network testnet|devnet] [--input route.json] [--out-dir deploy-config] [--apply]
       [--timeout 600] [--rpc-timeout 15] [--model <alias>] [--claude <bin>] [--registries <file>]

Inputs may also come from --input (JSON: sourceChainId, targetChainId, bridges[], veaNetwork); flags win.
Read-only RPC URLs come from REPORTER_RPC / ADAPTER_RPC in the environment or veashi-contracts/.env.
"hashi" in --bridges means Yaho/Yaru will be deployed fresh, so YAHO_ADDRESS/YARU_ADDRESS stay blank.
Exit codes: 0 ok, 1 usage, 2 agent failure, 3 verification failure, 4 publish failure.`;

function parseArgs(argv) {
  const o = {
    outDir: "deploy-config",
    timeout: 600,
    rpcTimeout: 15,
    veaNetwork: undefined,
    apply: false,
    claude: "claude",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--help" || a === "-h") return { help: true };
    else if (a === "--source") o.source = Number(next());
    else if (a === "--target") o.target = Number(next());
    else if (a === "--bridges") o.bridges = next();
    else if (a === "--vea-network") o.veaNetwork = next();
    else if (a === "--input") o.input = next();
    else if (a === "--out-dir") o.outDir = next();
    else if (a === "--apply") o.apply = true;
    else if (a === "--timeout") o.timeout = Number(next());
    else if (a === "--rpc-timeout") o.rpcTimeout = Number(next());
    else if (a === "--model") o.model = next();
    else if (a === "--claude") o.claude = next();
    else if (a === "--registries") o.registries = next();
    else throw new Error(`unknown argument ${a}`);
  }
  if (o.input) {
    const f = JSON.parse(fs.readFileSync(o.input, "utf8"));
    o.source ??= Number(f.sourceChainId);
    o.target ??= Number(f.targetChainId);
    o.bridges ??= Array.isArray(f.bridges) ? f.bridges.join(",") : f.bridges;
    o.veaNetwork ??= f.veaNetwork;
  }
  o.veaNetwork ??= "testnet";
  if (!Number.isInteger(o.source) || o.source <= 0) throw new Error("--source must be a positive chain id");
  if (!Number.isInteger(o.target) || o.target <= 0) throw new Error("--target must be a positive chain id");
  if (o.source === o.target) throw new Error("--source and --target must differ");
  if (!o.bridges) throw new Error("--bridges is required");
  o.bridges = parseBridges(o.bridges);
  if (!["testnet", "devnet"].includes(o.veaNetwork)) throw new Error("--vea-network must be testnet or devnet");
  if (!(o.timeout > 0) || !(o.rpcTimeout > 0)) throw new Error("timeouts must be positive seconds");
  return o;
}

function rpcUrls() {
  const local = fs.existsSync(path.join(pkgRoot, ".env"))
    ? parseEnv(fs.readFileSync(path.join(pkgRoot, ".env"), "utf8"))
    : {};
  const pick = (k) => process.env[k] || local[k];
  return { reporter: pick("REPORTER_RPC"), adapter: pick("ADAPTER_RPC") };
}

const fileSha = (p) => (fs.existsSync(p) ? sha256(fs.readFileSync(p, "utf8")) : null);

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    log(err.message);
    log(USAGE);
    return EXIT.usage;
  }
  if (opts.help) {
    console.log(USAGE);
    return EXIT.ok;
  }
  const { source, target, bridges, veaNetwork } = opts;
  const routeId = `${source}-${target}`;
  const outDir = path.resolve(pkgRoot, opts.outDir);
  const envPath = path.join(outDir, `${routeId}.env`);
  const reportPath = path.join(outDir, `${routeId}.report.json`);
  const failedPath = path.join(outDir, `${routeId}.failed.report.json`);
  const templatePath = path.join(pkgRoot, ".env.example");
  const registriesPath = opts.registries ? path.resolve(opts.registries) : path.join(here, "registries.json");
  const config = JSON.parse(fs.readFileSync(registriesPath, "utf8"));
  const template = fs.readFileSync(templatePath, "utf8");
  const urls = rpcUrls();
  for (const side of ["reporter", "adapter"]) {
    if (!urls[side]) {
      log(`${side.toUpperCase()}_RPC is not set (environment or veashi-contracts/.env)`);
      return EXIT.usage;
    }
  }
  const version = inputVersion({
    tool: `${TOOL}@${VERSION}`,
    source,
    target,
    bridges,
    veaNetwork,
    templateSha256: sha256(template),
    registriesConfigSha256: sha256(fs.readFileSync(registriesPath, "utf8")),
    hashiRecordSha256: fileSha(path.join(pkgRoot, "broadcast", `${routeId}.json`)),
  });
  const report = {
    tool: TOOL,
    toolVersion: VERSION,
    inputVersion: version,
    inputs: { sourceChainId: source, targetChainId: target, bridges, veaNetwork },
    generatedAt: new Date().toISOString(),
    rpc: { reporter: redactUrl(urls.reporter), adapter: redactUrl(urls.adapter) },
    template: { path: path.relative(repoRoot, templatePath), sha256: sha256(template) },
  };
  const bail = (code, reason, extra = {}) => {
    Object.assign(report, { status: "failed", failure: reason }, extra);
    writeAtomic(failedPath, JSON.stringify(report, null, 2) + "\n");
    log(`FAILED: ${reason}`);
    log(`diagnostics: ${path.relative(process.cwd(), failedPath)}`);
    if (fs.existsSync(envPath)) log(`previous ${path.relative(process.cwd(), envPath)} left untouched`);
    return code;
  };
  log(`route ${routeId} bridges=${bridges.join(",")} vea-network=${veaNetwork} input-version=${version.slice(0, 12)}`);

  // Trusted records first: a missing registry is a verification failure, not an agent problem.
  let registries;
  try {
    registries = await loadRegistries(config, bridges);
  } catch (err) {
    return bail(EXIT.verification, `registry fetch failed: ${err.message}`);
  }
  report.registries = registries.evidence;
  const trusted = resolveTrusted({ source, target, bridges, veaNetwork, repoRoot }, registries, config);
  report.trustedRecords = Object.fromEntries(Object.entries(trusted.expected).filter(([k]) => !k.startsWith("_")));
  for (const p of trusted.problems) log(`record problem: ${p.key}: ${p.reason}`);

  // Agent.
  const keys = agentKeys(bridges);
  // The agent reads a per-route extract of the registries from a scratch dir (the full
  // LayerZero metadata is several MB and gets truncated by fetch tools).
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "prepare-env-"));
  const extractPath = path.join(scratch, `registries-${routeId}.json`);
  const extract = JSON.stringify(extractForAgent(registries, config, source, target), null, 2);
  fs.writeFileSync(extractPath, extract);
  report.agentExtract = { sha256: sha256(extract), bytes: extract.length };
  const prompt = buildPrompt({ source, target, bridges, veaNetwork, keys, config, extractPath });
  log(`asking Claude Code for ${keys.length} keys (timeout ${opts.timeout}s)`);
  let agentRun;
  try {
    agentRun = await runAgent({
      prompt,
      timeoutMs: opts.timeout * 1000,
      model: opts.model,
      cwd: repoRoot,
      domains: config.agentFetchDomains,
      addDirs: [scratch],
      claudeBin: opts.claude,
    });
  } catch (err) {
    return bail(EXIT.agent, `agent: ${err.message}`, { agent: err.meta });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  const agent = validateAgentOutput(agentRun.structured, keys);
  report.agent = { ...agentRun.meta, entries: agent.entries, raw: agentRun.structured, validationErrors: agent.errors };
  log(`agent finished in ${agentRun.meta.durationMs}ms, ${agentRun.meta.numTurns} turns`);
  for (const e of agent.errors) log(`agent output: ${e}`);
  if (agent.errors.length) return bail(EXIT.agent, `agent output invalid: ${agent.errors.join("; ")}`);

  // Independent verification.
  const rpcs = {
    reporter: createRpc(urls.reporter, { timeoutMs: opts.rpcTimeout * 1000 }),
    adapter: createRpc(urls.adapter, { timeoutMs: opts.rpcTimeout * 1000 }),
  };
  const verification = await verify({ inputs: opts, agent, trusted, rpcs, domains: config.agentFetchDomains });
  report.verification = verification;
  for (const c of verification.checks) log(`${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : `: ${c.reason}`}`);
  if (verification.status !== "passed")
    return bail(EXIT.verification, `${verification.failures.length} check(s) failed`);

  // Publish.
  const values = {};
  for (const [k, x] of Object.entries(verification.values))
    values[k] = { value: x.value, source: x.source === "input" ? undefined : x.source };
  values.DEPLOYER_KEY = { value: "" };
  values.REPORTER_RPC = { value: urls.reporter };
  values.ADAPTER_RPC = { value: urls.adapter };
  if (bridges.includes("vea"))
    values.VEA_ADAPTER = { value: "", source: "filled by DeployVeaAdapter before SetupVeaAdapter runs" };
  if (bridges.includes("hashi"))
    for (const k of ["YAHO_ADDRESS", "YARU_ADDRESS"])
      values[k] = { value: "", source: "left blank: --hashi deploys fresh Yaho/Yaru" };
  const envText = renderEnv({
    template,
    values,
    bridges,
    header: [
      `Generated by ${TOOL} for route ${routeId} (${bridges.join(",")}); do not edit by hand.`,
      `input version: ${version}`,
      `verification report: ${path.relative(pkgRoot, reportPath)}`,
      "DEPLOYER_KEY is intentionally blank: add it just before deploying.",
    ],
  });
  report.status = "passed";
  report.output = { env: path.relative(repoRoot, envPath), report: path.relative(repoRoot, reportPath) };
  try {
    writeAtomic(envPath, envText);
    writeAtomic(reportPath, JSON.stringify(report, null, 2) + "\n");
    if (fs.existsSync(failedPath)) fs.unlinkSync(failedPath);
    if (opts.apply) {
      writeAtomic(path.join(pkgRoot, ".env"), envText);
      log(`applied to ${path.relative(process.cwd(), path.join(pkgRoot, ".env"))}`);
    }
  } catch (err) {
    log(`publish failed: ${err.message}`);
    return EXIT.publish;
  }
  log(`PASSED: wrote ${path.relative(process.cwd(), envPath)} and ${path.relative(process.cwd(), reportPath)}`);
  for (const l of verification.limitations) log(`note: ${l}`);
  return EXIT.ok;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    log(`unexpected error: ${err.stack ?? err}`);
    process.exit(EXIT.verification);
  }
);

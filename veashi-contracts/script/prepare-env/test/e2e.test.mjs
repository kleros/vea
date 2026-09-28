// End-to-end: real CLI process, fake `claude`, file:// registries and two local
// JSON-RPC stubs. Proves the wrapper verifies with code and publishes atomically.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { selector } from "../lib/keccak.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const toolDir = path.resolve(here, "..");
const A = (n) => "0x" + String(n).repeat(40);
const INBOX = A(1),
  OUTBOX = A(2),
  YAHO = A(5),
  YARU = A(6),
  HASHI = A(7);
const LZ_R = A("a"),
  LZ_A = A("b"),
  SEND = A("c"),
  RECV = A("d"),
  EXEC = A("e"),
  ROUTER_R = A("f"),
  ROUTER_A = A(9);
const word = (n) => "0x" + BigInt(n).toString(16).padStart(64, "0");
const addrWord = (a) => "0x" + a.slice(2).padStart(64, "0");
const strWord = (s) =>
  "0x" +
  "20".padStart(64, "0") +
  s.length.toString(16).padStart(64, "0") +
  Buffer.from(s).toString("hex").padEnd(64, "0");

let root,
  servers = [],
  urls = {};

function rpcServer(chainId, contracts) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        const { id, method, params } = JSON.parse(body);
        let result = "0x";
        if (method === "eth_chainId") result = "0x" + chainId.toString(16);
        else if (method === "eth_getCode") result = contracts[params[0].toLowerCase()] ? "0x6001" : "0x";
        else if (method === "eth_call") {
          const fn = contracts[params[0].to.toLowerCase()]?.[params[0].data.slice(0, 10)];
          if (!fn) return res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { message: "execution reverted" } }));
          result = typeof fn === "function" ? fn(params[0].data) : fn;
        }
        res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
      });
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/v1/apikey-secret` }));
  });
}

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prepare-env-e2e-"));
  const pkg = path.join(root, "veashi-contracts");
  fs.cpSync(toolDir, path.join(pkg, "script", "prepare-env"), { recursive: true });
  fs.copyFileSync(path.resolve(toolDir, "..", "..", ".env.example"), path.join(pkg, ".env.example"));
  fs.mkdirSync(path.join(pkg, "broadcast"), { recursive: true });
  fs.writeFileSync(
    path.join(pkg, "broadcast", "421614-11155111.json"),
    JSON.stringify({ yaho: YAHO, yaru: YARU, hashi: HASHI })
  );
  const dep = (net, id, file, json) => {
    const d = path.join(root, "contracts", "deployments", net);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, ".chainId"), String(id));
    fs.writeFileSync(path.join(d, file), JSON.stringify(json));
  };
  const getter = (name) => ({
    type: "function",
    name,
    inputs: [],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  });
  dep("arbitrumSepolia", 421614, "VeaInboxArbToEthTestnet.json", {
    address: INBOX,
    abi: [getter("veaOutboxArbToEth")],
  });
  dep("sepolia", 11155111, "VeaOutboxArbToEthTestnet.json", { address: OUTBOX, abi: [getter("veaInboxArbToEth")] });

  // Registries as local files.
  const reg = path.join(root, "registries");
  fs.mkdirSync(reg);
  const w = (f, t) => (fs.writeFileSync(path.join(reg, f), t), pathToFileURL(path.join(reg, f)).href);
  const lzUrl = w(
    "lz.json",
    JSON.stringify({
      "arbitrum-sepolia": {
        chainDetails: { nativeChainId: 421614 },
        deployments: [
          {
            eid: "40231",
            version: 2,
            endpointV2: { address: LZ_R },
            sendUln302: { address: SEND },
            receiveUln302: { address: A(3) },
            executor: { address: EXEC },
          },
        ],
      },
      sepolia: {
        chainDetails: { nativeChainId: 11155111 },
        deployments: [
          {
            eid: "40161",
            version: 2,
            endpointV2: { address: LZ_A },
            sendUln302: { address: A(4) },
            receiveUln302: { address: RECV },
            executor: { address: A(4) },
          },
        ],
      },
    })
  );
  const selUrl = w(
    "selectors.yml",
    'selectors:\n  421614:\n    selector: 3478487238524512106\n    name: "ethereum-testnet-sepolia-arbitrum-1"\n  11155111:\n    selector: 16015286601757825753\n    name: "ethereum-testnet-sepolia"\n'
  );
  const ccipT = w(
    "ccip-testnet.json",
    JSON.stringify({
      "ethereum-testnet-sepolia-arbitrum-1": { chainSelector: "3478487238524512106", router: { address: ROUTER_R } },
      "ethereum-testnet-sepolia": { chainSelector: "16015286601757825753", router: { address: ROUTER_A } },
    })
  );
  const ccipM = w("ccip-mainnet.json", "{}");
  fs.writeFileSync(
    path.join(root, "registries.json"),
    JSON.stringify({
      layerzero: { url: lzUrl },
      ccip: { selectors: selUrl, mainnet: ccipM, testnet: ccipT },
      axelar: { mainnet: ccipM, testnet: ccipM },
      debridge: { docs: "https://docs.debridge.finance/" },
      agentFetchDomains: ["example.invalid"],
    })
  );

  // Fake claude: prints a print-mode result whose structured_output comes from FAKE_CLAUDE_OUTPUT.
  const fake = path.join(root, "fake-claude.mjs");
  fs.writeFileSync(
    fake,
    `import fs from "node:fs";
const args = process.argv.slice(2);
fs.writeFileSync(process.env.FAKE_CLAUDE_ARGS, JSON.stringify(args));
const structured_output = JSON.parse(fs.readFileSync(process.env.FAKE_CLAUDE_OUTPUT, "utf8"));
console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, structured_output, session_id: "fake", num_turns: 3, duration_ms: 42, total_cost_usd: 0 }));`
  );
  fs.writeFileSync(path.join(root, "claude"), `#!/bin/sh\nexec node ${fake} "$@"\n`, { mode: 0o755 });

  const reporter = await rpcServer(421614, {
    [INBOX]: { [selector("veaOutboxArbToEth()")]: addrWord(OUTBOX) },
    [YAHO]: {},
    [LZ_R]: { [selector("eid()")]: word(40231) },
    [SEND]: {},
    [EXEC]: {},
    [ROUTER_R]: {
      [selector("typeAndVersion()")]: strWord("Router 1.2.0"),
      [selector("isChainSupported(uint64)")]: (d) => word(BigInt("0x" + d.slice(10)) === 16015286601757825753n ? 1 : 0),
    },
  });
  const adapter = await rpcServer(11155111, {
    [OUTBOX]: { [selector("veaInboxArbToEth()")]: addrWord(INBOX) },
    [YARU]: {
      [selector("YAHO()")]: addrWord(YAHO),
      [selector("HASHI()")]: addrWord(HASHI),
      [selector("SOURCE_CHAIN_ID()")]: word(421614),
    },
    [LZ_A]: { [selector("eid()")]: word(40161) },
    [RECV]: {},
    [ROUTER_A]: {
      [selector("typeAndVersion()")]: strWord("Router 1.2.0"),
      [selector("isChainSupported(uint64)")]: (d) => word(BigInt("0x" + d.slice(10)) === 3478487238524512106n ? 1 : 0),
    },
  });
  servers = [reporter.srv, adapter.srv];
  urls = { reporter: reporter.url, adapter: adapter.url };
});
after(() => servers.forEach((s) => s.close()));

const entry = (key, value, chainId, sourceRef) => ({
  key,
  value,
  chainId,
  sourceKind: sourceRef.startsWith("http") ? "registry" : "repo",
  sourceRef,
});
const goodOutput = () => ({
  entries: [
    entry("YAHO_ADDRESS", YAHO, 421614, "veashi-contracts/broadcast/421614-11155111.json"),
    entry("YARU_ADDRESS", YARU, 11155111, "veashi-contracts/broadcast/421614-11155111.json"),
    entry("VEA_INBOX", INBOX, 421614, "contracts/deployments/arbitrumSepolia/VeaInboxArbToEthTestnet.json"),
    entry("VEA_OUTBOX", OUTBOX, 11155111, "contracts/deployments/sepolia/VeaOutboxArbToEthTestnet.json"),
    entry("LZ_REPORTER_ENDPOINT", LZ_R, 421614, "https://lz"),
    entry("LZ_ADAPTER_ENDPOINT", LZ_A, 11155111, "https://lz"),
    entry("LZ_REPORTER_EID", "40231", 421614, "https://lz"),
    entry("LZ_ADAPTER_EID", "40161", 11155111, "https://lz"),
    entry("LZ_SEND_LIB", SEND, 421614, "https://lz"),
    entry("LZ_EXECUTOR", EXEC, 421614, "https://lz"),
    entry("LZ_RECEIVE_LIB", RECV, 11155111, "https://lz"),
    entry("CCIP_REPORTER_ROUTER", ROUTER_R, 421614, "https://ccip"),
    entry("CCIP_ADAPTER_ROUTER", ROUTER_A, 11155111, "https://ccip"),
    entry("CCIP_REPORTER_CHAIN_SELECTOR", "3478487238524512106", 421614, "https://ccip"),
    entry("CCIP_ADAPTER_CHAIN_SELECTOR", "16015286601757825753", 11155111, "https://ccip"),
  ],
  unresolved: [],
});

// The RPC stubs live in this process, so the CLI must run asynchronously (spawnSync would starve them).
const exec = (args, env) =>
  new Promise((resolve) => {
    const child = spawn("node", args, { cwd: root, env: { PATH: process.env.PATH, HOME: root, ...env } });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
const cli = path.join(root, "veashi-contracts", "script", "prepare-env", "prepare-env.mjs");

async function run(output, extraArgs = [], rpc = urls) {
  const outFile = path.join(root, "agent-output.json");
  fs.writeFileSync(outFile, JSON.stringify(output));
  const argsFile = path.join(root, "agent-args.json");
  fs.rmSync(argsFile, { force: true });
  const r = await exec(
    [
      cli,
      "--source",
      "421614",
      "--target",
      "11155111",
      "--bridges",
      "vea,lz,ccip",
      "--claude",
      path.join(root, "claude"),
      "--registries",
      path.join(root, "registries.json"),
      "--out-dir",
      "deploy-config",
      "--rpc-timeout",
      "5",
      ...extraArgs,
    ],
    { REPORTER_RPC: rpc.reporter, ADAPTER_RPC: rpc.adapter, FAKE_CLAUDE_OUTPUT: outFile, FAKE_CLAUDE_ARGS: argsFile }
  );
  return { ...r, agentArgs: fs.existsSync(argsFile) ? JSON.parse(fs.readFileSync(argsFile, "utf8")) : null };
}

test("e2e: a fully consistent route is verified and published with sources", async () => {
  const r = await run(goodOutput(), ["--apply"]);
  assert.equal(r.status, 0, r.stderr);
  const envPath = path.join(root, "veashi-contracts", "deploy-config", "421614-11155111.env");
  const env = fs.readFileSync(envPath, "utf8");
  assert.match(env, /^# Generated by veashi-prepare-env/);
  assert.match(
    env,
    /# source: contracts\/deployments\/arbitrumSepolia\/VeaInboxArbToEthTestnet.json\nVEA_INBOX=0x1{40}\n/
  );
  assert.match(env, /# source: file:\/\/.*lz.json#arbitrum-sepolia.deployments\[eid=40231\]\nLZ_SEND_LIB=0xc{40}\n/);
  assert.match(env, /\nCCIP_REPORTER_CHAIN_SELECTOR=3478487238524512106\n/);
  assert.match(env, /\nREPORTER_CHAIN_ID=421614\nADAPTER_CHAIN_ID=11155111\n/);
  assert.match(env, /\nVEA_SOURCE_CHAIN_ID=421614\n/, "keys the template lacks are appended");
  assert.match(env, /\nDEPLOYER_KEY=\n/);
  assert.match(env, /\nAXELAR_REPORTER_GATEWAY=\n/, "unrequested bridge values are blanked");
  assert.match(env, /\nDEBRIDGE_REPORTER_GATE_ADDRESS=\n/);
  assert.match(
    env,
    new RegExp(`\\nREPORTER_RPC=${urls.reporter.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}\\n`),
    "RPC written through"
  );
  assert.equal(
    fs.readFileSync(path.join(root, "veashi-contracts", ".env"), "utf8"),
    env,
    "--apply copies the same content"
  );
  const report = JSON.parse(
    fs.readFileSync(path.join(root, "veashi-contracts", "deploy-config", "421614-11155111.report.json"), "utf8")
  );
  assert.equal(report.status, "passed");
  assert.match(report.inputVersion, /^[0-9a-f]{64}$/);
  assert.equal(
    report.rpc.reporter,
    urls.reporter.replace(/\/v1\/apikey-secret$/, "/[redacted]"),
    "RPC credentials redacted in the report"
  );
  assert.ok(!JSON.stringify(report).includes("apikey-secret"));
  assert.ok(report.verification.checks.every((c) => c.ok));
  assert.ok(report.verification.checks.some((c) => c.name === "lane:CCIP_REPORTER_ROUTER"));
  assert.ok(report.registries.layerzero.sha256);
  assert.equal(report.verification.level.LZ_SEND_LIB, "registry-record");
  assert.equal(report.agent.sessionId, "fake");
  assert.ok(r.agentArgs.includes("--json-schema") && r.agentArgs.includes("--no-session-persistence"));
  assert.ok(r.agentArgs.includes("WebFetch(domain:example.invalid)"));
  const addDirIdx = r.agentArgs.indexOf("--add-dir");
  assert.ok(addDirIdx > 0, "registry extract dir is passed to the agent");
  assert.ok(!fs.existsSync(r.agentArgs[addDirIdx + 1]), "extract dir is cleaned up afterwards");
  const promptText = r.agentArgs[r.agentArgs.indexOf("-p") + 1];
  assert.match(promptText, /Start by reading \/.*registries-421614-11155111\.json/, "prompt points at the extract");
});

test("e2e: an agent answer that disagrees with the registry fails and preserves the previous env", async () => {
  const before = fs.readFileSync(path.join(root, "veashi-contracts", "deploy-config", "421614-11155111.env"), "utf8");
  const bad = goodOutput();
  bad.entries.find((e) => e.key === "LZ_RECEIVE_LIB").value = A(4); // real SendUln on the wrong side
  const r = await run(bad);
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /FAIL record:LZ_RECEIVE_LIB: agent gave/);
  assert.equal(
    fs.readFileSync(path.join(root, "veashi-contracts", "deploy-config", "421614-11155111.env"), "utf8"),
    before
  );
  const failed = JSON.parse(
    fs.readFileSync(path.join(root, "veashi-contracts", "deploy-config", "421614-11155111.failed.report.json"), "utf8")
  );
  assert.equal(failed.status, "failed");
  assert.ok(failed.verification.failures.length === 1);
});

test("e2e: unresolved keys are an agent failure (exit 2) and a bad chain is a verification failure", async () => {
  const partial = goodOutput();
  partial.entries = partial.entries.filter((e) => e.key !== "YARU_ADDRESS");
  partial.unresolved = [{ key: "YARU_ADDRESS", reason: "not found" }];
  const r = await run(partial);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /YARU_ADDRESS: unresolved by agent/);

  const swapped = await run(goodOutput(), [], { reporter: urls.adapter, adapter: urls.reporter });
  assert.equal(swapped.status, 3, swapped.stderr);
  assert.match(
    swapped.stderr,
    /rpc:reporter:chainId: RPC http:\/\/127.0.0.1:\d+\/\[redacted\] reports chain 11155111, expected 421614/
  );
  assert.ok(!swapped.stderr.includes("apikey-secret"), "logs never show RPC credentials");
});

test("e2e: usage errors exit 1 without touching outputs", () => {
  const r = spawnSync("node", [path.join(toolDir, "prepare-env.mjs"), "--source", "1", "--bridges", "lz"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--target must be/);
});

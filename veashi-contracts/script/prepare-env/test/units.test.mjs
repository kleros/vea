import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { keccak256, selector, toChecksumAddress, isValidAddress } from "../lib/keccak.mjs";
import { requiredKeys, agentKeys, parseBridges } from "../lib/spec.mjs";
import { redactUrl, encodeCall, decodeString, decodeAddress } from "../lib/rpc.mjs";
import {
  parseSelectorsYaml,
  resolveLayerZero,
  resolveCcip,
  resolveAxelar,
  resolveVea,
  resolveHashi,
  resolveDebridge,
  extractForAgent,
} from "../lib/records.mjs";
import { validateAgentOutput, runAgent } from "../lib/agent.mjs";
import { inputVersion, parseEnv, renderEnv, writeAtomic } from "../lib/env.mjs";
import { verify } from "../lib/verify.mjs";

test("keccak256 matches known vectors and cast selectors", () => {
  assert.equal(keccak256(""), "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
  assert.equal(keccak256("abc"), "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
  assert.equal(selector("eid()"), "0x416ecebf");
  assert.equal(selector("isChainSupported(uint64)"), "0xa48a9058");
  assert.equal(
    toChecksumAddress("0x1a44076050125825900e736c501f859c50fe728c"),
    "0x1a44076050125825900e736c501f859c50fE728c"
  );
  assert.ok(isValidAddress("0x1a44076050125825900e736c501f859c50fe728c"));
  assert.ok(!isValidAddress("0x1A44076050125825900e736c501f859c50fe728c"), "bad checksum rejected");
  assert.ok(!isValidAddress("0x1234"));
});

test("spec: required and agent keys follow the bridge flags", () => {
  assert.deepEqual(parseBridges("LZ, vea,lz"), ["lz", "vea"]);
  assert.throws(() => parseBridges("hashi"), /at least one/);
  assert.throws(() => parseBridges("foo"), /unknown bridge/);
  assert.ok(requiredKeys(["lz"]).includes("LZ_SEND_LIB"));
  assert.ok(!requiredKeys(["lz"]).includes("CCIP_REPORTER_ROUTER"));
  assert.ok(agentKeys(["lz"]).includes("YAHO_ADDRESS"));
  assert.ok(!agentKeys(["lz", "hashi"]).includes("YAHO_ADDRESS"), "fresh hashi deploy needs no Yaho record");
  assert.ok(!agentKeys(["lz"]).includes("LZ_DEFAULT_FEE"), "operator defaults are not researched");
});

test("rpc helpers: redaction and abi coding", () => {
  assert.equal(redactUrl("https://user:pw@rpc.example.com/v3/SECRET?x=1"), "https://rpc.example.com/[redacted]");
  assert.equal(redactUrl("https://rpc.example.com"), "https://rpc.example.com");
  assert.equal(encodeCall("isChainSupported(uint64)", ["5"]), "0xa48a9058" + "5".padStart(64, "0"));
  const str =
    "0x" + "20".padStart(64, "0") + "c".padStart(64, "0") + Buffer.from("Router 1.2.0").toString("hex").padEnd(64, "0");
  assert.equal(decodeString(str), "Router 1.2.0");
  assert.equal(decodeAddress("0x" + "ab".repeat(20).padStart(64, "0")), "0x" + "ab".repeat(20));
});

const lzFixture = {
  arbitrum: {
    chainDetails: { nativeChainId: 42161 },
    deployments: [
      { eid: "110", version: 1 },
      {
        eid: "30110",
        version: 2,
        endpointV2: { address: "0xaa" },
        sendUln302: { address: "0xbb" },
        receiveUln302: { address: "0xcc" },
        executor: { address: "0xdd" },
      },
    ],
  },
  dup: {
    chainDetails: { nativeChainId: 99 },
    deployments: [{ eid: "1", version: 2, endpointV2: { address: "0x01" } }],
  },
  dup2: {
    chainDetails: { nativeChainId: 99 },
    deployments: [{ eid: "2", version: 2, endpointV2: { address: "0x02" } }],
  },
};

test("records: registry lookups report missing and conflicting entries", () => {
  const lz = resolveLayerZero(lzFixture, 42161, "u");
  assert.equal(lz.endpoint.value, "0xaa");
  assert.equal(lz.eid.value, "30110");
  assert.match(resolveLayerZero(lzFixture, 5, "u").problem, /no v2 endpoint/);
  assert.match(resolveLayerZero(lzFixture, 99, "u").problem, /conflicting/);

  const yml =
    'selectors:\n  42161:\n    selector: 4949039107694359620\n    name: "ethereum-mainnet-arbitrum-1"\n  7:\n    selector: 1\n    name: "seven"\n';
  const selectors = parseSelectorsYaml(yml);
  assert.equal(selectors["42161"].name, "ethereum-mainnet-arbitrum-1");
  const chains = {
    mainnet: { "ethereum-mainnet-arbitrum-1": { chainSelector: "4949039107694359620", router: { address: "0xr1" } } },
    testnet: { seven: { chainSelector: "2", router: { address: "0xr7" } } },
  };
  const urls = { mainnet: "m", testnet: "t", selectors: "s" };
  const ccip = resolveCcip({ ccipSelectors: selectors, ccipChains: chains }, 42161, urls);
  assert.equal(ccip.router.value, "0xr1");
  assert.equal(ccip.net, "mainnet");
  assert.match(
    resolveCcip({ ccipSelectors: selectors, ccipChains: chains }, 7, urls).problem,
    /conflicting CCIP selectors/
  );
  assert.match(resolveCcip({ ccipSelectors: selectors, ccipChains: chains }, 1514, urls).problem, /no CCIP entry/);

  const axelar = {
    mainnet: {
      chains: {
        arbitrum: {
          axelarId: "arbitrum",
          chainId: 42161,
          contracts: { AxelarGateway: { address: "0xg" }, AxelarGasService: { address: "0xs" } },
        },
      },
    },
    testnet: { chains: {} },
  };
  assert.equal(resolveAxelar(axelar, 42161, urls).chainName.value, "arbitrum");
  assert.match(resolveAxelar(axelar, 1514, urls).problem, /no chain with id/);

  const debridge = {
    chains: [
      { chainId: 100000013, originalChainId: 1514, chainName: "Story" },
      { chainId: 42161, originalChainId: 42161 },
    ],
  };
  assert.equal(resolveDebridge(debridge, 1514, "d").debridgeChainId.value, "100000013");
  assert.match(resolveDebridge(debridge, 5, "d").problem, /does not list chain 5/);

  const registries = {
    lz: lzFixture,
    ccipSelectors: selectors,
    ccipChains: chains,
    axelar,
    debridge,
    evidence: {
      layerzero: { url: "L", sha256: "h" },
      ccipSelectors: { url: "S" },
      ccipMainnet: { url: "M" },
      ccipTestnet: { url: "T" },
      axelarMainnet: { url: "AM" },
      axelarTestnet: { url: "AT" },
      debridgeChains: { url: "D" },
    },
  };
  const extract = extractForAgent(registries, { debridge: { docs: "docs" } }, 42161, 1514);
  assert.deepEqual(Object.keys(extract.layerzero.chains), ["arbitrum"], "only the route's chains are extracted");
  assert.equal(extract.layerzero.url, "L");
  assert.equal(extract.ccip.chains["ethereum-mainnet-arbitrum-1"].router.address, "0xr1");
  assert.equal(extract.axelar.chains.arbitrum.url, "AM");
  assert.equal(extract.debridge.chains.length, 2);
});

function tmpRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prepare-env-"));
  const dep = (net, id, files) => {
    const d = path.join(root, "contracts", "deployments", net);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, ".chainId"), String(id));
    for (const [f, json] of Object.entries(files)) fs.writeFileSync(path.join(d, f), JSON.stringify(json));
  };
  dep("arbitrumSepolia", 421614, {
    "VeaInboxArbToEthTestnet.json": { address: "0x" + "1".repeat(40), abi: [] },
    "VeaInboxArbToGnosisTestnet.json": { address: "0x" + "3".repeat(40), abi: [] },
  });
  dep("sepolia", 11155111, { "VeaOutboxArbToEthTestnet.json": { address: "0x" + "2".repeat(40), abi: [] } });
  fs.mkdirSync(path.join(root, "veashi-contracts", "broadcast"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "veashi-contracts", "broadcast", "421614-11155111.json"),
    JSON.stringify({ yaho: "0xy", yaru: "0xz", hashi: "0xh" })
  );
  return root;
}

test("records: repo lookups pair inbox with outbox and fail on missing flavours", () => {
  const root = tmpRepo();
  const vea = resolveVea(root, 421614, 11155111, "testnet");
  assert.equal(vea.inbox.value, "0x" + "1".repeat(40));
  assert.equal(vea.outbox.ref, path.join("contracts", "deployments", "sepolia", "VeaOutboxArbToEthTestnet.json"));
  assert.match(resolveVea(root, 421614, 11155111, "devnet").problem, /no devnet Vea/);
  assert.match(resolveVea(root, 42161, 1, "testnet").problem, /no Vea deployment record for chain 42161/);
  assert.equal(resolveHashi(root, 421614, 11155111).yaho.value, "0xy");
  assert.match(resolveHashi(root, 1, 2).problem, /no Hashi broadcast record/);
});

test("agent: output validation rejects bad addresses, duplicates, unresolved and missing keys", () => {
  const keys = ["LZ_REPORTER_ENDPOINT", "LZ_REPORTER_EID", "YAHO_ADDRESS"];
  const out = validateAgentOutput(
    {
      entries: [
        {
          key: "LZ_REPORTER_ENDPOINT",
          value: "0x1A44076050125825900e736c501f859c50fe728c",
          chainId: 42161,
          sourceKind: "registry",
          sourceRef: "https://x",
        },
        { key: "LZ_REPORTER_EID", value: "30110", chainId: 42161, sourceKind: "registry", sourceRef: "https://x" },
        { key: "LZ_REPORTER_EID", value: "30110", chainId: 42161, sourceKind: "registry", sourceRef: "https://x" },
        { key: "NOT_A_KEY", value: "x", chainId: 1, sourceKind: "docs", sourceRef: "https://x" },
      ],
      unresolved: [{ key: "YAHO_ADDRESS", reason: "no broadcast file" }],
    },
    keys
  );
  assert.ok(out.errors.some((e) => /LZ_REPORTER_ENDPOINT: .*checksummed/.test(e)));
  assert.ok(out.errors.some((e) => /LZ_REPORTER_EID: returned more than once/.test(e)));
  assert.ok(out.errors.some((e) => /YAHO_ADDRESS: unresolved/.test(e)));
  assert.ok(!("NOT_A_KEY" in out.entries));
  const good = validateAgentOutput(
    {
      entries: [
        { key: "LZ_REPORTER_EID", value: "30110", chainId: 42161, sourceKind: "registry", sourceRef: "https://x" },
      ],
      unresolved: [],
    },
    ["LZ_REPORTER_EID", "YAHO_ADDRESS"]
  );
  assert.deepEqual(good.errors, ["YAHO_ADDRESS: missing from agent output"]);
});

function fakeSpawn(behaviour) {
  return (bin, args, opts) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => child.emit("close", null);
    setTimeout(() => behaviour(child, args, opts), 5);
    return child;
  };
}

test("agent: runAgent parses structured output, strips secrets, enforces timeout and failures", async () => {
  const result = {
    type: "result",
    subtype: "success",
    is_error: false,
    structured_output: { entries: [], unresolved: [] },
    session_id: "s",
    num_turns: 1,
    duration_ms: 1,
    total_cost_usd: 0,
  };
  let seenArgs, seenEnv;
  const ok = await runAgent({
    prompt: "p",
    timeoutMs: 1000,
    cwd: ".",
    domains: ["a.example"],
    spawnImpl: fakeSpawn((c, args, opts) => {
      seenArgs = args;
      seenEnv = opts.env;
      c.stdout.emit("data", JSON.stringify(result));
      c.emit("close", 0);
    }),
    env: {
      PATH: "/bin",
      ANTHROPIC_API_KEY: "sk-x",
      REPORTER_RPC: "https://secret",
      DEPLOYER_KEY: "0x1",
      CLAUDE_CONFIG_DIR: "/c",
    },
  });
  assert.deepEqual(ok.structured, { entries: [], unresolved: [] });
  assert.ok(seenArgs.includes("WebFetch(domain:a.example)"));
  assert.ok(seenArgs.includes("--json-schema") && seenArgs.includes("dontAsk"));
  assert.deepEqual(
    Object.keys(seenEnv).sort(),
    ["CLAUDE_CONFIG_DIR", "PATH"],
    "API key, RPC and deployer key never reach the agent"
  );
  await assert.rejects(
    runAgent({ prompt: "p", timeoutMs: 20, cwd: ".", domains: [], spawnImpl: fakeSpawn(() => {}) }),
    /timed out/
  );
  await assert.rejects(
    runAgent({
      prompt: "p",
      timeoutMs: 1000,
      cwd: ".",
      domains: [],
      spawnImpl: fakeSpawn((c) => {
        c.stdout.emit(
          "data",
          JSON.stringify({ ...result, subtype: "error_during_execution", structured_output: undefined, result: "boom" })
        );
        c.emit("close", 1);
      }),
    }),
    /did not succeed/
  );
  await assert.rejects(
    runAgent({
      prompt: "p",
      timeoutMs: 1000,
      cwd: ".",
      domains: [],
      spawnImpl: fakeSpawn((c) => {
        c.stdout.emit("data", "garbage");
        c.emit("close", 1);
      }),
    }),
    /non-JSON/
  );
});

test("env: rendering keeps comments, blanks unrequested bridges, appends missing keys", () => {
  const template =
    "DEPLOYER_KEY=0XPRIV\n# LayerZero\nLZ_REPORTER_ENDPOINT=0xold\nLZ_DEFAULT_FEE=100000\nCCIP_REPORTER_ROUTER=0xstale\n";
  const text = renderEnv({
    template,
    values: {
      DEPLOYER_KEY: { value: "" },
      LZ_REPORTER_ENDPOINT: { value: "0xnew", source: "https://reg" },
      VEA_SOURCE_CHAIN_ID: { value: "1" },
    },
    bridges: ["lz"],
    header: ["h1"],
  });
  assert.match(text, /^# h1\n/);
  assert.match(text, /# LayerZero\n# source: https:\/\/reg\nLZ_REPORTER_ENDPOINT=0xnew\n/);
  assert.match(text, /\nLZ_DEFAULT_FEE=100000\n/, "operator default kept");
  assert.match(text, /\nCCIP_REPORTER_ROUTER=\n/, "unrequested bridge blanked");
  assert.match(text, /\nDEPLOYER_KEY=\n/);
  assert.match(text, /missing from .env.example\nVEA_SOURCE_CHAIN_ID=1/);
  assert.deepEqual(parseEnv('A=1\n# c\nB="two"\n export C=3 '), { A: "1", B: "two", C: "3" });
  assert.equal(
    inputVersion({ b: 1, a: [1, 2] }),
    inputVersion({ a: [1, 2], b: 1 }),
    "key order does not change the version"
  );
  assert.notEqual(inputVersion({ a: 1 }), inputVersion({ a: 2 }));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atomic-"));
  writeAtomic(path.join(dir, "x", "f.env"), "hello");
  assert.equal(fs.readFileSync(path.join(dir, "x", "f.env"), "utf8"), "hello");
  assert.deepEqual(fs.readdirSync(path.join(dir, "x")), ["f.env"], "no temp file left behind");
});

const A = (n) => "0x" + String(n).repeat(40);
function fakeRpc(chainId, handlers, codeOf = () => 2) {
  return {
    redacted: "https://rpc",
    chainId: async () => chainId,
    codeSize: async (addr) => codeOf(addr),
    ethCall: async (to, data) => {
      const h = handlers[`${to.toLowerCase()}:${data.slice(0, 10)}`];
      if (!h) throw new Error("revert");
      return typeof h === "function" ? h(data) : h;
    },
  };
}
const word = (n) => "0x" + BigInt(n).toString(16).padStart(64, "0");
const addrWord = (a) => "0x" + a.slice(2).padStart(64, "0");

test("verify: passes with consistent records and chains, fails on mismatch, wrong chain and empty code", async () => {
  const inputs = { source: 42161, target: 1514, bridges: ["lz"] };
  const trusted = {
    problems: [],
    expected: {
      REPORTER_CHAIN_ID: { value: "42161", ref: "input", kind: "derived" },
      YAHO_ADDRESS: { value: A(5), ref: "broadcast", kind: "repo" },
      YARU_ADDRESS: { value: A(6), ref: "broadcast", kind: "repo" },
      _hashi: { value: A(7), ref: "broadcast" },
      LZ_REPORTER_ENDPOINT: { value: A(1), ref: "lz#a", kind: "registry" },
      LZ_REPORTER_EID: { value: "30110", ref: "lz#a", kind: "registry" },
      LZ_ADAPTER_ENDPOINT: { value: A(2), ref: "lz#b", kind: "registry" },
      LZ_ADAPTER_EID: { value: "30364", ref: "lz#b", kind: "registry" },
    },
  };
  const entry = (v, ref = "https://x") => ({ value: v, chainId: 1, sourceKind: "registry", sourceRef: ref });
  const agent = {
    entries: {
      YAHO_ADDRESS: entry(A(5)),
      YARU_ADDRESS: entry(A(6)),
      LZ_REPORTER_ENDPOINT: entry(A(1)),
      LZ_REPORTER_EID: entry("30110"),
      LZ_ADAPTER_ENDPOINT: entry(A(2)),
      LZ_ADAPTER_EID: entry("30364"),
    },
  };
  const eid = "0x416ecebf";
  const rpcs = {
    reporter: fakeRpc(42161, { [`${A(1)}:${eid}`]: word(30110) }),
    adapter: fakeRpc(1514, {
      [`${A(2)}:${eid}`]: word(30364),
      [`${A(6)}:0x9e83334b`]: addrWord(A(5)),
      [`${A(6)}:0x74be2150`]: word(42161),
      [`${A(6)}:0x523d415a`]: addrWord(A(7)),
    }),
  };
  const good = await verify({ inputs, agent, trusted, rpcs });
  assert.equal(good.status, "passed", JSON.stringify(good.failures));
  assert.equal(good.values.LZ_REPORTER_ENDPOINT.level, "registry-record");
  assert.equal(good.values.REPORTER_CHAIN_ID.value, "42161");

  const bad = await verify({
    inputs,
    agent: { entries: { ...agent.entries, LZ_REPORTER_ENDPOINT: entry(A(9)) } },
    trusted,
    rpcs,
  });
  assert.equal(bad.status, "failed");
  assert.ok(bad.failures.some((f) => /record:LZ_REPORTER_ENDPOINT: agent gave/.test(f)));

  const wrongChain = await verify({ inputs, agent, trusted, rpcs: { ...rpcs, adapter: fakeRpc(1, {}) } });
  assert.ok(wrongChain.failures.some((f) => /rpc:adapter:chainId: RPC https:\/\/rpc reports chain 1/.test(f)));

  const noCode = await verify({
    inputs,
    agent,
    trusted,
    rpcs: { ...rpcs, reporter: fakeRpc(42161, { [`${A(1)}:${eid}`]: word(30110) }, (a) => (a === A(1) ? 0 : 2)) },
  });
  assert.ok(noCode.failures.some((f) => /code:LZ_REPORTER_ENDPOINT: no bytecode/.test(f)));

  const staleHashi = await verify({
    inputs,
    agent,
    trusted: { ...trusted, expected: { ...trusted.expected, _hashi: { value: A(8), ref: "broadcast" } } },
    rpcs,
  });
  assert.ok(
    staleHashi.failures.some((f) => /record:hashi/.test(f)),
    "Yaru.HASHI disagreeing with the broadcast record is a conflict"
  );

  const debridge = await verify({
    inputs: { source: 42161, target: 1514, bridges: ["debridge"] },
    agent: {
      entries: {
        DEBRIDGE_REPORTER_GATE_ADDRESS: entry(A(3), "https://docs.debridge.finance/x"),
        DEBRIDGE_ADAPTER_GATE_ADDRESS: entry(A(3), "https://evil.example/x"),
        DEBRIDGE_REPORTER_CHAIN_ID: entry("42161", "https://docs.debridge.finance/x"),
      },
    },
    trusted: { problems: [], expected: {} },
    rpcs: {
      reporter: fakeRpc(42161, { [`${A(3)}:0x3408e470`]: word(42161) }),
      adapter: fakeRpc(1514, { [`${A(3)}:0x3408e470`]: word(100000013) }),
    },
  });
  assert.ok(
    debridge.failures.some((f) => /citation:DEBRIDGE_ADAPTER_GATE_ADDRESS/.test(f)),
    "uncited value rejected"
  );
  assert.ok(debridge.checks.some((c) => c.name === "identity:DEBRIDGE_REPORTER_GATE_ADDRESS" && c.ok));
  assert.equal(debridge.values.DEBRIDGE_REPORTER_GATE_ADDRESS.level, "citation");
});

// Trusted records: repo deployment files plus the official registries listed in
// registries.json. Everything here is deterministic code; the agent's answers
// are compared against what this module resolves.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { sameAddress } from "./keccak.mjs";

export const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");

export async function fetchText(url, { timeoutMs = 30_000, fetchImpl = fetch } = {}) {
  if (url.startsWith("file://")) return fs.readFileSync(new URL(url), "utf8"); // offline runs and tests
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch only the registries the requested bridges need; record a hash of each body as evidence. */
export async function loadRegistries(config, bridges, { fetchImpl } = {}) {
  const evidence = {};
  const get = async (name, url) => {
    const text = await fetchText(url, { fetchImpl });
    evidence[name] = { url, sha256: sha256(text), bytes: text.length, fetchedAt: new Date().toISOString() };
    return text;
  };
  const reg = { evidence };
  if (bridges.includes("lz")) reg.lz = JSON.parse(await get("layerzero", config.layerzero.url));
  if (bridges.includes("ccip")) {
    reg.ccipSelectors = parseSelectorsYaml(await get("ccipSelectors", config.ccip.selectors));
    reg.ccipChains = {
      mainnet: JSON.parse(await get("ccipMainnet", config.ccip.mainnet)),
      testnet: JSON.parse(await get("ccipTestnet", config.ccip.testnet)),
    };
  }
  if (bridges.includes("debridge")) reg.debridge = JSON.parse(await get("debridgeChains", config.debridge.chains));
  if (bridges.includes("axelar")) {
    reg.axelar = {
      mainnet: JSON.parse(await get("axelarMainnet", config.axelar.mainnet)),
      testnet: JSON.parse(await get("axelarTestnet", config.axelar.testnet)),
    };
  }
  return reg;
}

/** selectors.yml is `selectors:\n  <chainId>:\n    selector: N\n    name: "x"`; a line parser is enough. */
export function parseSelectorsYaml(text) {
  const out = {};
  let current;
  for (const line of text.split("\n")) {
    const id = line.match(/^\s{2}(\d+):\s*$/);
    if (id) {
      current = { chainId: Number(id[1]) };
      out[id[1]] = current;
      continue;
    }
    if (!current) continue;
    const sel = line.match(/^\s{4}selector:\s*(\d+)/);
    if (sel) current.selector = sel[1];
    const name = line.match(/^\s{4}name:\s*"?([^"\s]+)"?/);
    if (name) current.name = name[1];
  }
  return out;
}

/* ---------------- repo records ---------------- */

function veaDeploymentDir(repoRoot, chainId) {
  const base = path.join(repoRoot, "contracts", "deployments");
  if (!fs.existsSync(base)) return undefined;
  return fs
    .readdirSync(base)
    .map((d) => path.join(base, d))
    .find(
      (d) =>
        fs.existsSync(path.join(d, ".chainId")) &&
        fs.readFileSync(path.join(d, ".chainId"), "utf8").trim() === String(chainId)
    );
}

/** Vea inbox on the source chain and the matching outbox on the target chain, for one network flavour. */
export function resolveVea(repoRoot, source, target, network) {
  const flavour = network[0].toUpperCase() + network.slice(1);
  const srcDir = veaDeploymentDir(repoRoot, source);
  const dstDir = veaDeploymentDir(repoRoot, target);
  if (!srcDir) return { problem: `no Vea deployment record for chain ${source} under contracts/deployments` };
  if (!dstDir) return { problem: `no Vea deployment record for chain ${target} under contracts/deployments` };
  const inboxes = fs.readdirSync(srcDir).filter((f) => new RegExp(`^VeaInbox.+${flavour}\\.json$`).test(f));
  const pairs = [];
  for (const inbox of inboxes) {
    const route = inbox.replace(/^VeaInbox/, "").replace(new RegExp(`${flavour}\\.json$`), "");
    const outbox = `VeaOutbox${route}${flavour}.json`;
    if (fs.existsSync(path.join(dstDir, outbox))) pairs.push({ inbox, outbox, route });
  }
  if (pairs.length === 0)
    return { problem: `no ${network} Vea inbox/outbox pair for ${source}->${target} under contracts/deployments` };
  if (pairs.length > 1)
    return { problem: `ambiguous Vea records for ${source}->${target}: ${pairs.map((p) => p.inbox).join(", ")}` };
  const [p] = pairs;
  const rel = (dir, f) => path.relative(repoRoot, path.join(dir, f));
  const inboxJson = JSON.parse(fs.readFileSync(path.join(srcDir, p.inbox), "utf8"));
  const outboxJson = JSON.parse(fs.readFileSync(path.join(dstDir, p.outbox), "utf8"));
  return {
    inbox: { value: inboxJson.address, ref: rel(srcDir, p.inbox), abi: inboxJson.abi },
    outbox: { value: outboxJson.address, ref: rel(dstDir, p.outbox), abi: outboxJson.abi },
    route: p.route,
  };
}

export function resolveHashi(repoRoot, source, target) {
  const rel = path.join("veashi-contracts", "broadcast", `${source}-${target}.json`);
  const file = path.join(repoRoot, rel);
  if (!fs.existsSync(file))
    return { problem: `no Hashi broadcast record ${rel}; deploy with --hashi or add the record` };
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const missing = ["yaho", "yaru"].filter((k) => !json[k]);
  if (missing.length) return { problem: `${rel} lacks ${missing.join(", ")}` };
  return { yaho: { value: json.yaho, ref: rel }, yaru: { value: json.yaru, ref: rel }, hashi: json.hashi, ref: rel };
}

/* ---------------- registry lookups ---------------- */

export function resolveLayerZero(lz, chainId, url) {
  const matches = Object.entries(lz).filter(([, v]) => v?.chainDetails?.nativeChainId === chainId);
  const v2 = matches.flatMap(([key, v]) =>
    (v.deployments ?? []).filter((d) => d.version === 2 && d.endpointV2?.address).map((d) => ({ key, d }))
  );
  if (v2.length === 0) return { problem: `LayerZero metadata has no v2 endpoint for chain ${chainId}` };
  const distinct = new Set(v2.map(({ d }) => d.endpointV2.address.toLowerCase()));
  if (distinct.size > 1) return { problem: `LayerZero metadata lists conflicting v2 endpoints for chain ${chainId}` };
  const { key, d } = v2[0];
  const ref = `${url}#${key}.deployments[eid=${d.eid}]`;
  return {
    endpoint: { value: d.endpointV2.address, ref },
    eid: { value: String(d.eid), ref },
    sendLib: d.sendUln302?.address ? { value: d.sendUln302.address, ref } : undefined,
    receiveLib: d.receiveUln302?.address ? { value: d.receiveUln302.address, ref } : undefined,
    executor: d.executor?.address ? { value: d.executor.address, ref } : undefined,
  };
}

export function resolveCcip({ ccipSelectors, ccipChains }, chainId, urls) {
  const sel = ccipSelectors[String(chainId)];
  if (!sel?.name || !sel?.selector) return { problem: `chain-selectors has no CCIP entry for chain ${chainId}` };
  const hits = ["mainnet", "testnet"].filter((net) => ccipChains[net]?.[sel.name]);
  if (hits.length === 0)
    return { problem: `CCIP directory has no chain "${sel.name}" (${chainId}); CCIP may not support it` };
  if (hits.length > 1) return { problem: `CCIP directory lists "${sel.name}" in both mainnet and testnet` };
  const net = hits[0];
  const entry = ccipChains[net][sel.name];
  if (String(entry.chainSelector) !== String(sel.selector))
    return {
      problem: `conflicting CCIP selectors for ${sel.name}: ${sel.selector} (chain-selectors) vs ${entry.chainSelector} (directory)`,
    };
  if (!entry.router?.address) return { problem: `CCIP directory has no router for ${sel.name}` };
  const ref = `${urls[net]}#${sel.name}`;
  return {
    net,
    router: { value: entry.router.address, ref },
    selector: { value: String(sel.selector), ref: `${urls.selectors}#${chainId}` },
  };
}

export function resolveAxelar(axelar, chainId, urls) {
  const hits = [];
  for (const net of ["mainnet", "testnet"]) {
    for (const [key, c] of Object.entries(axelar[net]?.chains ?? {}))
      if (c.chainId === chainId) hits.push({ net, key, c });
  }
  if (hits.length === 0) return { problem: `Axelar registry has no chain with id ${chainId}` };
  if (hits.length > 1)
    return { problem: `Axelar registry lists chain ${chainId} more than once (${hits.map((h) => h.key).join(", ")})` };
  const { net, key, c } = hits[0];
  const ref = `${urls[net]}#chains.${key}`;
  const gw = c.contracts?.AxelarGateway?.address;
  const gas = c.contracts?.AxelarGasService?.address;
  if (!gw) return { problem: `Axelar registry has no AxelarGateway for ${key}` };
  return {
    net,
    gateway: { value: gw, ref },
    gasService: gas ? { value: gas, ref } : undefined,
    chainName: { value: c.axelarId ?? key, ref },
  };
}

/** deBridge's own chain id (differs from the EVM id on some chains, e.g. Story 1514 -> 100000013). */
export function resolveDebridge(api, chainId, url) {
  const hits = (api?.chains ?? []).filter((c) => c.originalChainId === chainId);
  if (hits.length === 0) return { problem: `deBridge supported-chains API does not list chain ${chainId}` };
  if (hits.length > 1) return { problem: `deBridge supported-chains API lists chain ${chainId} more than once` };
  return { debridgeChainId: { value: String(hits[0].chainId), ref: `${url}#originalChainId=${chainId}` } };
}

/**
 * Compact per-route extract of the registries, for the agent to read locally: the full
 * LayerZero metadata alone is several megabytes and gets truncated by fetch tools.
 * Every section carries the URL to cite and the sha256 of the full body it came from.
 */
export function extractForAgent(registries, config, source, target) {
  const ids = [source, target];
  const out = {
    note: "Pre-filtered from the official registries by prepare-env; cite the `url` of each section, not this file.",
    chains: ids,
  };
  const ev = registries.evidence;
  if (registries.lz) {
    const chains = {};
    for (const [key, v] of Object.entries(registries.lz))
      if (ids.includes(v?.chainDetails?.nativeChainId))
        chains[key] = { chainDetails: v.chainDetails, deployments: v.deployments };
    out.layerzero = { url: ev.layerzero.url, sha256: ev.layerzero.sha256, chains };
  }
  if (registries.ccipSelectors) {
    const selectors = Object.fromEntries(
      ids.map((id) => [id, registries.ccipSelectors[String(id)]]).filter(([, v]) => v)
    );
    const chains = {};
    for (const net of ["mainnet", "testnet"])
      for (const s of Object.values(selectors))
        if (registries.ccipChains[net]?.[s.name])
          chains[s.name] = { network: net, ...registries.ccipChains[net][s.name] };
    out.ccip = {
      selectorsUrl: ev.ccipSelectors.url,
      chainsUrls: { mainnet: ev.ccipMainnet.url, testnet: ev.ccipTestnet.url },
      selectors,
      chains,
    };
  }
  if (registries.axelar) {
    const chains = {};
    for (const net of ["mainnet", "testnet"])
      for (const [key, c] of Object.entries(registries.axelar[net]?.chains ?? {}))
        if (ids.includes(c.chainId))
          chains[key] = {
            network: net,
            url: ev[`axelar${net[0].toUpperCase()}${net.slice(1)}`].url,
            axelarId: c.axelarId,
            chainId: c.chainId,
            contracts: { AxelarGateway: c.contracts?.AxelarGateway, AxelarGasService: c.contracts?.AxelarGasService },
          };
    out.axelar = { chains };
  }
  if (registries.debridge)
    out.debridge = {
      url: ev.debridgeChains.url,
      chains: registries.debridge.chains.filter((c) => ids.includes(c.originalChainId)),
      gateDocs: config.debridge.docs,
    };
  return out;
}

/**
 * Everything the code can pin down for a route. Returns `expected` (KEY -> {value, ref, kind})
 * and `problems` (missing or conflicting records). deBridge has no registry, so it is absent
 * here and handled by on-chain identity checks in verify.mjs.
 */
export function resolveTrusted({ source, target, bridges, veaNetwork, repoRoot }, registries, config) {
  const expected = {};
  const problems = [];
  const nets = {};
  const put = (key, rec, kind) => rec && (expected[key] = { value: rec.value, ref: rec.ref, kind });
  const need = (key, rec, what) =>
    rec ? put(key, rec, "registry") : problems.push({ key, reason: `${what} not in registry` });

  put("REPORTER_CHAIN_ID", { value: String(source), ref: "input" }, "derived");
  put("ADAPTER_CHAIN_ID", { value: String(target), ref: "input" }, "derived");

  if (!bridges.includes("hashi")) {
    const h = resolveHashi(repoRoot, source, target);
    if (h.problem) problems.push({ key: "YAHO_ADDRESS,YARU_ADDRESS", reason: h.problem });
    else {
      put("YAHO_ADDRESS", h.yaho, "repo");
      put("YARU_ADDRESS", h.yaru, "repo");
      expected._hashi = { value: h.hashi, ref: h.ref };
    }
  }
  if (bridges.includes("vea")) {
    put("VEA_SOURCE_CHAIN_ID", { value: String(source), ref: "input" }, "derived");
    put("VEA_TARGET_CHAIN_ID", { value: String(target), ref: "input" }, "derived");
    const v = resolveVea(repoRoot, source, target, veaNetwork);
    if (v.problem) problems.push({ key: "VEA_INBOX,VEA_OUTBOX", reason: v.problem });
    else {
      put("VEA_INBOX", v.inbox, "repo");
      put("VEA_OUTBOX", v.outbox, "repo");
      expected._veaAbi = { inbox: v.inbox.abi, outbox: v.outbox.abi };
    }
  }
  if (bridges.includes("lz")) {
    const r = resolveLayerZero(registries.lz, source, config.layerzero.url);
    const a = resolveLayerZero(registries.lz, target, config.layerzero.url);
    if (r.problem) problems.push({ key: "LZ_REPORTER_*", reason: r.problem });
    else {
      put("LZ_REPORTER_ENDPOINT", r.endpoint, "registry");
      put("LZ_REPORTER_EID", r.eid, "registry");
      need("LZ_SEND_LIB", r.sendLib, `SendUln302 for chain ${source}`);
      need("LZ_EXECUTOR", r.executor, `Executor for chain ${source}`);
    }
    if (a.problem) problems.push({ key: "LZ_ADAPTER_*", reason: a.problem });
    else {
      put("LZ_ADAPTER_ENDPOINT", a.endpoint, "registry");
      put("LZ_ADAPTER_EID", a.eid, "registry");
      need("LZ_RECEIVE_LIB", a.receiveLib, `ReceiveUln302 for chain ${target}`);
    }
  }
  if (bridges.includes("ccip")) {
    const r = resolveCcip(registries, source, config.ccip);
    const a = resolveCcip(registries, target, config.ccip);
    if (r.problem) problems.push({ key: "CCIP_REPORTER_*", reason: r.problem });
    else {
      put("CCIP_REPORTER_ROUTER", r.router, "registry");
      put("CCIP_REPORTER_CHAIN_SELECTOR", r.selector, "registry");
    }
    if (a.problem) problems.push({ key: "CCIP_ADAPTER_*", reason: a.problem });
    else {
      put("CCIP_ADAPTER_ROUTER", a.router, "registry");
      put("CCIP_ADAPTER_CHAIN_SELECTOR", a.selector, "registry");
    }
    if (r.net && a.net && r.net !== a.net)
      problems.push({
        key: "CCIP",
        reason: `chain ${source} is ${r.net} but ${target} is ${a.net}; CCIP lanes never cross networks`,
      });
    nets.ccip = r.net;
  }
  if (bridges.includes("debridge")) {
    const r = resolveDebridge(registries.debridge, source, config.debridge.chains);
    if (r.problem) problems.push({ key: "DEBRIDGE_REPORTER_CHAIN_ID", reason: r.problem });
    else put("DEBRIDGE_REPORTER_CHAIN_ID", r.debridgeChainId, "registry");
  }
  if (bridges.includes("axelar")) {
    const r = resolveAxelar(registries.axelar, source, config.axelar);
    const a = resolveAxelar(registries.axelar, target, config.axelar);
    if (r.problem) problems.push({ key: "AXELAR_REPORTER_*", reason: r.problem });
    else {
      put("AXELAR_REPORTER_GATEWAY", r.gateway, "registry");
      need("AXELAR_REPORTER_GAS_SERVICE", r.gasService, `AxelarGasService for chain ${source}`);
      put("AXELAR_REPORTER_CHAIN_NAME", r.chainName, "registry");
    }
    if (a.problem) problems.push({ key: "AXELAR_ADAPTER_*", reason: a.problem });
    else {
      put("AXELAR_ADAPTER_GATEWAY", a.gateway, "registry");
      put("AXELAR_ADAPTER_CHAIN_NAME", a.chainName, "registry");
    }
    if (r.net && a.net && r.net !== a.net)
      problems.push({ key: "AXELAR", reason: `chain ${source} is ${r.net} but ${target} is ${a.net}` });
  }
  return { expected, problems, nets };
}

export { sameAddress };

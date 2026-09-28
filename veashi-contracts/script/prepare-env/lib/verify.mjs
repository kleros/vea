// Independent verification. Nothing here trusts the agent: values are compared
// with the records resolved in records.mjs and with what the chains themselves
// report. Every check lands in the report with its evidence.
import { KEYS } from "./spec.mjs";
import { keccak256, sameAddress } from "./keccak.mjs";
import { encodeCall, decodeAddress, decodeUint, decodeBool, decodeBytes32, decodeString } from "./rpc.mjs";

const CITATION_DOMAINS = { debridge: ["docs.debridge.com", "docs.debridge.finance"] };

function hostOf(ref) {
  try {
    return new URL(ref).host;
  } catch {
    return undefined;
  }
}

export async function verify({ inputs, agent, trusted, rpcs, domains }) {
  const { source, target, bridges } = inputs;
  const checks = [];
  const failures = [];
  const values = {};
  const ok = (name, detail) => checks.push({ name, ok: true, ...detail });
  const fail = (name, reason, detail = {}) => {
    checks.push({ name, ok: false, reason, ...detail });
    failures.push(`${name}: ${reason}`);
  };

  for (const p of trusted.problems) fail(`record:${p.key}`, p.reason);

  // 1. Agent values against trusted records.
  for (const [key, e] of Object.entries(agent.entries)) {
    const exp = trusted.expected[key];
    const spec = KEYS[key];
    if (exp) {
      const same =
        spec.type === "address"
          ? sameAddress(e.value, exp.value)
          : spec.type === "uint"
          ? BigInt(e.value) === BigInt(exp.value)
          : e.value === exp.value;
      if (same) {
        ok(`record:${key}`, { value: e.value, record: exp.ref, agentSource: e.sourceRef });
        values[key] = { value: e.value, source: exp.ref, level: `${exp.kind}-record` };
      } else
        fail(`record:${key}`, `agent gave ${e.value} (${e.sourceRef}) but trusted record ${exp.ref} says ${exp.value}`);
    } else {
      const allowed = CITATION_DOMAINS[spec.group] ?? [];
      const host = hostOf(e.sourceRef);
      if (host && allowed.includes(host)) {
        ok(`citation:${key}`, {
          value: e.value,
          agentSource: e.sourceRef,
          note: "no machine-readable registry; citation + on-chain identity only",
        });
        values[key] = { value: e.value, source: e.sourceRef, level: "citation" };
      } else
        fail(
          `citation:${key}`,
          `no trusted record for ${key} and its citation "${e.sourceRef}" is not from ${
            allowed.join("/") || "an approved source"
          }`
        );
    }
  }
  for (const [key, exp] of Object.entries(trusted.expected)) {
    if (key.startsWith("_")) continue;
    if (!values[key] && !agent.entries[key]) values[key] = { value: exp.value, source: exp.ref, level: exp.kind };
  }

  // 2. Chain ids.
  const chains = { reporter: source, adapter: target };
  const idOk = {};
  for (const side of ["reporter", "adapter"]) {
    try {
      const id = await rpcs[side].chainId();
      idOk[side] = id === chains[side];
      if (idOk[side]) ok(`rpc:${side}:chainId`, { rpc: rpcs[side].redacted, chainId: id });
      else fail(`rpc:${side}:chainId`, `RPC ${rpcs[side].redacted} reports chain ${id}, expected ${chains[side]}`);
    } catch (err) {
      fail(`rpc:${side}:chainId`, err.message);
    }
  }
  const v = (key) => values[key]?.value;
  const rpcFor = (key) => rpcs[KEYS[key].side];
  const call = async (side, to, sig, args) => rpcs[side].ethCall(to, encodeCall(sig, args));
  const identity = async (name, side, to, sig, args, decode, expectFn, describe) => {
    if (!to || !idOk[side]) return;
    try {
      const got = decode(await call(side, to, sig, args));
      const [pass, expected] = expectFn(got);
      if (pass) ok(name, { contract: to, call: sig, result: String(got) });
      else fail(name, `${describe}: ${sig} on ${to} returned ${got}, expected ${expected}`);
    } catch (err) {
      fail(name, `${sig} on ${to} failed: ${err.message}`);
    }
  };

  // 3. Bytecode for every published address.
  for (const key of Object.keys(values)) {
    if (KEYS[key]?.type !== "address" || !KEYS[key].side || !idOk[KEYS[key].side]) continue;
    try {
      const size = await rpcFor(key).codeSize(v(key));
      if (size > 0) ok(`code:${key}`, { address: v(key), bytes: size });
      else fail(`code:${key}`, `no bytecode at ${v(key)} on chain ${chains[KEYS[key].side]}`);
    } catch (err) {
      fail(`code:${key}`, err.message);
    }
  }

  // 4. Identity checks where the contracts expose one.
  if (bridges.includes("lz")) {
    await identity(
      "identity:LZ_REPORTER_ENDPOINT",
      "reporter",
      v("LZ_REPORTER_ENDPOINT"),
      "eid()",
      [],
      decodeUint,
      (g) => [g === BigInt(v("LZ_REPORTER_EID") ?? -1), v("LZ_REPORTER_EID")],
      "endpoint eid"
    );
    await identity(
      "identity:LZ_ADAPTER_ENDPOINT",
      "adapter",
      v("LZ_ADAPTER_ENDPOINT"),
      "eid()",
      [],
      decodeUint,
      (g) => [g === BigInt(v("LZ_ADAPTER_EID") ?? -1), v("LZ_ADAPTER_EID")],
      "endpoint eid"
    );
  }
  if (bridges.includes("ccip")) {
    for (const side of ["reporter", "adapter"]) {
      const S = side.toUpperCase();
      const other = side === "reporter" ? "ADAPTER" : "REPORTER";
      await identity(
        `identity:CCIP_${S}_ROUTER`,
        side,
        v(`CCIP_${S}_ROUTER`),
        "typeAndVersion()",
        [],
        decodeString,
        (g) => [g.startsWith("Router"), "Router x.y.z"],
        "router type"
      );
      await identity(
        `lane:CCIP_${S}_ROUTER`,
        side,
        v(`CCIP_${S}_ROUTER`),
        "isChainSupported(uint64)",
        [v(`CCIP_${other}_CHAIN_SELECTOR`) ?? 0],
        decodeBool,
        (g) => [g === true, "true"],
        `router supports selector ${v(`CCIP_${other}_CHAIN_SELECTOR`)}`
      );
    }
  }
  if (bridges.includes("axelar")) {
    const gw = "0x" + keccak256("axelar-gateway");
    const gas = "0x" + keccak256("axelar-gas-service");
    await identity(
      "identity:AXELAR_REPORTER_GATEWAY",
      "reporter",
      v("AXELAR_REPORTER_GATEWAY"),
      "contractId()",
      [],
      decodeBytes32,
      (g) => [g === gw, gw],
      "gateway contractId"
    );
    await identity(
      "identity:AXELAR_ADAPTER_GATEWAY",
      "adapter",
      v("AXELAR_ADAPTER_GATEWAY"),
      "contractId()",
      [],
      decodeBytes32,
      (g) => [g === gw, gw],
      "gateway contractId"
    );
    await identity(
      "identity:AXELAR_REPORTER_GAS_SERVICE",
      "reporter",
      v("AXELAR_REPORTER_GAS_SERVICE"),
      "contractId()",
      [],
      decodeBytes32,
      (g) => [g === gas, gas],
      "gas service contractId"
    );
  }
  if (bridges.includes("debridge")) {
    await identity(
      "identity:DEBRIDGE_REPORTER_GATE_ADDRESS",
      "reporter",
      v("DEBRIDGE_REPORTER_GATE_ADDRESS"),
      "getChainId()",
      [],
      decodeUint,
      (g) => [g === BigInt(v("DEBRIDGE_REPORTER_CHAIN_ID") ?? -1), v("DEBRIDGE_REPORTER_CHAIN_ID")],
      "deBridge chain id"
    );
    await identity(
      "identity:DEBRIDGE_ADAPTER_GATE_ADDRESS",
      "adapter",
      v("DEBRIDGE_ADAPTER_GATE_ADDRESS"),
      "getChainId()",
      [],
      decodeUint,
      (g) => [g > 0n, "> 0"],
      "deBridge chain id"
    );
  }
  if (v("YARU_ADDRESS")) {
    await identity(
      "identity:YARU_ADDRESS:yaho",
      "adapter",
      v("YARU_ADDRESS"),
      "YAHO()",
      [],
      decodeAddress,
      (g) => [sameAddress(g, v("YAHO_ADDRESS")), v("YAHO_ADDRESS")],
      "Yaru.YAHO"
    );
    await identity(
      "identity:YARU_ADDRESS:sourceChain",
      "adapter",
      v("YARU_ADDRESS"),
      "SOURCE_CHAIN_ID()",
      [],
      decodeUint,
      (g) => [g === BigInt(source), source],
      "Yaru.SOURCE_CHAIN_ID"
    );
    const h = trusted.expected._hashi;
    if (h?.value)
      await identity(
        "record:hashi",
        "adapter",
        v("YARU_ADDRESS"),
        "HASHI()",
        [],
        decodeAddress,
        (g) => [sameAddress(g, h.value), h.value],
        `Yaru.HASHI vs ${h.ref}`
      );
  }
  if (bridges.includes("vea") && trusted.expected._veaAbi) {
    const getters = (abi, prefix) =>
      abi
        .filter(
          (f) =>
            f.type === "function" && f.name.startsWith(prefix) && !f.inputs.length && f.outputs?.[0]?.type === "address"
        )
        .map((f) => f.name);
    const { inbox, outbox } = trusted.expected._veaAbi;
    for (const g of getters(outbox, "veaInbox"))
      await identity(
        `identity:VEA_OUTBOX:${g}`,
        "adapter",
        v("VEA_OUTBOX"),
        `${g}()`,
        [],
        decodeAddress,
        (got) => [sameAddress(got, v("VEA_INBOX")), v("VEA_INBOX")],
        "outbox -> inbox link"
      );
    for (const g of getters(inbox, "veaOutbox"))
      await identity(
        `identity:VEA_INBOX:${g}`,
        "reporter",
        v("VEA_INBOX"),
        `${g}()`,
        [],
        decodeAddress,
        (got) => [sameAddress(got, v("VEA_OUTBOX")), v("VEA_OUTBOX")],
        "inbox -> outbox link"
      );
    const ri = getters(inbox, "router"),
      ro = getters(outbox, "router");
    if (ri.length && ro.length && idOk.reporter && idOk.adapter) {
      try {
        const a = decodeAddress(await call("reporter", v("VEA_INBOX"), `${ri[0]}()`, []));
        const b = decodeAddress(await call("adapter", v("VEA_OUTBOX"), `${ro[0]}()`, []));
        if (sameAddress(a, b)) ok("identity:VEA:router", { router: a });
        else fail("identity:VEA:router", `inbox.${ri[0]}()=${a} but outbox.${ro[0]}()=${b}`);
      } catch (err) {
        fail("identity:VEA:router", err.message);
      }
    }
  }

  const level = Object.fromEntries(Object.entries(values).map(([k, x]) => [k, x.level]));
  const limitations = [];
  if (bridges.includes("debridge"))
    limitations.push(
      "deBridge has no machine-readable registry: gate addresses are verified by bytecode and getChainId() plus a docs citation only."
    );
  limitations.push(
    "Bytecode and identity getters prove the contracts behave like the expected ones; they do not prove source-code identity. Use the block explorer verification for that."
  );
  limitations.push(
    "Fee/funding amounts, HEADER_STORAGE and LZ DVN addresses hardcoded in script/layerZero/*.s.sol are operator-set and not verified here."
  );
  return { status: failures.length ? "failed" : "passed", checks, failures, values, level, limitations };
}

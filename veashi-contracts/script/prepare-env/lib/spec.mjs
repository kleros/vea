// What the Foundry deploy scripts under script/ read from .env, grouped by the
// bridge flag of deploy-route.sh that needs them. `side` says which chain a
// value belongs to; `type` drives syntax checks; `from` says who supplies it:
//   agent    - researched by the agent, then matched against a trusted record
//   derived  - computed from the inputs
//   template - operator-set default copied from .env.example, not verified
//   env      - copied from the caller's environment (RPC URLs)
//   blank    - intentionally left empty (secrets, post-deploy values)
export const BRIDGES = ["vea", "lz", "ccip", "debridge", "axelar", "hashi"];

export const KEYS = {
  DEPLOYER_KEY: { group: "core", from: "blank", type: "secret" },
  HEADER_STORAGE: { group: "core", from: "template", type: "address" },
  YAHO_ADDRESS: { group: "core", from: "agent", type: "address", side: "reporter" },
  YARU_ADDRESS: { group: "core", from: "agent", type: "address", side: "adapter" },
  REPORTER_CHAIN_ID: { group: "core", from: "derived", type: "uint" },
  ADAPTER_CHAIN_ID: { group: "core", from: "derived", type: "uint" },
  REPORTER_RPC: { group: "core", from: "env", type: "url" },
  ADAPTER_RPC: { group: "core", from: "env", type: "url" },

  VEA_INBOX: { group: "vea", from: "agent", type: "address", side: "reporter" },
  VEA_OUTBOX: { group: "vea", from: "agent", type: "address", side: "adapter" },
  VEA_SOURCE_CHAIN_ID: { group: "vea", from: "derived", type: "uint" },
  VEA_TARGET_CHAIN_ID: { group: "vea", from: "derived", type: "uint" },
  VEA_ADAPTER: { group: "vea", from: "blank", type: "address" },

  LZ_REPORTER_ENDPOINT: { group: "lz", from: "agent", type: "address", side: "reporter" },
  LZ_ADAPTER_ENDPOINT: { group: "lz", from: "agent", type: "address", side: "adapter" },
  LZ_REPORTER_EID: { group: "lz", from: "agent", type: "uint", side: "reporter" },
  LZ_ADAPTER_EID: { group: "lz", from: "agent", type: "uint", side: "adapter" },
  LZ_SEND_LIB: { group: "lz", from: "agent", type: "address", side: "reporter" },
  LZ_EXECUTOR: { group: "lz", from: "agent", type: "address", side: "reporter" },
  LZ_RECEIVE_LIB: { group: "lz", from: "agent", type: "address", side: "adapter" },
  LZ_DEFAULT_FEE: { group: "lz", from: "template", type: "uint" },

  CCIP_REPORTER_ROUTER: { group: "ccip", from: "agent", type: "address", side: "reporter" },
  CCIP_ADAPTER_ROUTER: { group: "ccip", from: "agent", type: "address", side: "adapter" },
  CCIP_REPORTER_CHAIN_SELECTOR: { group: "ccip", from: "agent", type: "uint", side: "reporter" },
  CCIP_ADAPTER_CHAIN_SELECTOR: { group: "ccip", from: "agent", type: "uint", side: "adapter" },

  DEBRIDGE_REPORTER_GATE_ADDRESS: { group: "debridge", from: "agent", type: "address", side: "reporter" },
  DEBRIDGE_ADAPTER_GATE_ADDRESS: { group: "debridge", from: "agent", type: "address", side: "adapter" },
  DEBRIDGE_REPORTER_CHAIN_ID: { group: "debridge", from: "agent", type: "uint", side: "reporter" },
  DEBRIDGE_REPORTER_FEE: { group: "debridge", from: "template", type: "uint" },

  AXELAR_REPORTER_GATEWAY: { group: "axelar", from: "agent", type: "address", side: "reporter" },
  AXELAR_REPORTER_GAS_SERVICE: { group: "axelar", from: "agent", type: "address", side: "reporter" },
  AXELAR_ADAPTER_GATEWAY: { group: "axelar", from: "agent", type: "address", side: "adapter" },
  AXELAR_REPORTER_CHAIN_NAME: { group: "axelar", from: "agent", type: "string", side: "reporter" },
  AXELAR_ADAPTER_CHAIN_NAME: { group: "axelar", from: "agent", type: "string", side: "adapter" },
  AXELAR_REPORTER_FEE: { group: "axelar", from: "template", type: "uint" },
  AXELAR_REPORTER_FUNDING: { group: "axelar", from: "template", type: "uint" },
};

/** Keys that must be present in the output for the requested bridges. */
export function requiredKeys(bridges) {
  const groups = new Set(["core", ...bridges.filter((b) => b !== "hashi")]);
  return Object.keys(KEYS).filter((k) => groups.has(KEYS[k].group));
}

/** Keys the agent must resolve. With `hashi` requested, Yaho/Yaru are deployed fresh, so they are left blank. */
export function agentKeys(bridges) {
  const fresh = bridges.includes("hashi");
  return requiredKeys(bridges).filter(
    (k) => KEYS[k].from === "agent" && !(fresh && (k === "YAHO_ADDRESS" || k === "YARU_ADDRESS"))
  );
}

export function parseBridges(text) {
  const list = String(text)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const unknown = list.filter((b) => !BRIDGES.includes(b));
  if (unknown.length) throw new Error(`unknown bridge(s): ${unknown.join(", ")} (known: ${BRIDGES.join(", ")})`);
  if (!list.some((b) => b !== "hashi")) throw new Error("at least one of vea, lz, ccip, debridge, axelar is required");
  return [...new Set(list)].sort();
}

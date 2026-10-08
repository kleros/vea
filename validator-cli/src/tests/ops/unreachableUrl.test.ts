import { EventEmitter } from "node:events";
import { validateEnvironment, PARITY_PROBE_CLAIM } from "../../utils/envValidation";
import { EnvValidationError } from "../../utils/errors";
import { hashClaim } from "../../utils/claim";
import { BotEvents } from "../../utils/botEvents";

// run-001 #12, [L19] (b), [L21] (f): an unreachable URL, the first one included,
// is a warning and is pruned in place from every RPC list of the shared bridge
// config; a list left with no URL answering as the expected chain stays fatal.

const VALID_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const SEPOLIA = 11155111;
const CHIADO = 10200;
const ARB_SEPOLIA = 421614;

const KEY = "a1b2c3d4e5f6SECRETKEY";
const ETH_DOWN = `https://eth-down.example/v3/${KEY}`;
const ETH_GOOD = "https://eth-good.example/rpc";
const ARB_DOWN = `https://arb-down.example/${KEY}`;
const ARB_GOOD = "https://arb-good.example/rpc";
const GNO_GOOD = "https://gno-good.example/rpc";
const GNO_DOWN = "https://gno-down.example/rpc";

type Served = { chainId: number; down?: boolean };

const SERVED: Record<string, Served> = {
  [ETH_DOWN]: { chainId: SEPOLIA, down: true },
  [ETH_GOOD]: { chainId: SEPOLIA },
  [ARB_DOWN]: { chainId: ARB_SEPOLIA, down: true },
  [ARB_GOOD]: { chainId: ARB_SEPOLIA },
  [GNO_GOOD]: { chainId: CHIADO },
  [GNO_DOWN]: { chainId: CHIADO, down: true },
};

const providerFactory = (served: Record<string, Served> = SERVED) =>
  jest.fn((urls: string[], _expected: number) => ({
    getNetwork: jest.fn(async () => {
      const endpoint = served[urls[0]];
      if (endpoint.down) throw new Error(`missing response (url="${urls[0]}")`);
      return { chainId: endpoint.chainId };
    }),
    getCode: jest.fn(async () => "0x6080"),
    getBalance: jest.fn(async () => 10n ** 18n),
  }));

const ENV_KEYS = ["RPC_ARB", "RPC_ETH", "RPC_GNOSIS", "GNOSIS_WETH"];

/** A fresh copy of the shipped bridge config, built from the given RPC variables. */
const loadBridgeRoutes = (rpc: Record<string, string>) => {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { GNOSIS_WETH: "0x8d74e5e4DA11629537C4575cB0f33b4F0Dfa42EB", ...rpc });
  let routes: typeof import("../../consts/bridgeRoutes") | undefined;
  jest.isolateModules(() => {
    routes = require("../../consts/bridgeRoutes");
  });
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  return routes!;
};

const run = (getBridgeConfig: any, chains: number[], overrides: any = {}) =>
  validateEnvironment({
    env: {
      PRIVATE_KEY: VALID_KEY,
      VEAOUTBOX_CHAINS: chains.join(","),
      NETWORKS: "testnet",
      ENVIO_URL: "http://localhost:8080/v1/graphql",
    },
    fetchBridgeConfig: getBridgeConfig,
    createProvider: providerFactory() as any,
    readDepositTokenBalance: async () => ({ balance: 10n ** 18n, allowance: 10n ** 18n }),
    readOutboxHashClaim: async () => hashClaim(PARITY_PROBE_CLAIM as any),
    emitter: new EventEmitter(),
    ...overrides,
  });

const problemsFrom = async (promise: Promise<unknown>): Promise<string[]> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof EnvValidationError) return error.problems;
    throw error;
  }
  throw new Error("expected validateEnvironment to reject");
};

describe("ops #12: an unreachable RPC URL is pruned, not fatal", () => {
  it("starts with an unreachable first URL and a good second one, and getBridgeConfig lists only the second", async () => {
    const { getBridgeConfig } = loadBridgeRoutes({ RPC_ARB: ARB_GOOD, RPC_ETH: `${ETH_DOWN},${ETH_GOOD}` });
    const emitter = new EventEmitter();
    const alerts: any[] = [];
    emitter.on(BotEvents.ALERT, (payload) => alerts.push(payload));

    const result = await run(getBridgeConfig, [SEPOLIA], { emitter });

    expect(result.chainIds).toEqual([SEPOLIA]);
    expect(getBridgeConfig(SEPOLIA).outboxRPC).toEqual([ETH_GOOD]);
    expect(result.warnings.some((w) => w.includes("RPC_ETH endpoint 1") && w.includes("unreachable"))).toBe(true);
    expect(alerts).toEqual([
      expect.objectContaining({
        level: "warn",
        code: "rpc_url_unreachable",
        chainId: SEPOLIA,
        details: expect.objectContaining({ envVar: "RPC_ETH", url: "https://eth-down.example" }),
      }),
    ]);
    expect(JSON.stringify({ warnings: result.warnings, alerts })).not.toContain(KEY);
  });

  it("prunes the URL from every list that holds it: RPC_ETH feeds the Sepolia outbox and the Chiado router", async () => {
    const { getBridgeConfig } = loadBridgeRoutes({
      RPC_ARB: `${ARB_DOWN},${ARB_GOOD}`,
      RPC_ETH: `${ETH_DOWN},${ETH_GOOD}`,
      RPC_GNOSIS: GNO_GOOD,
    });
    const createProvider = providerFactory();

    await run(getBridgeConfig, [SEPOLIA, CHIADO], { createProvider });

    expect(getBridgeConfig(SEPOLIA).outboxRPC).toEqual([ETH_GOOD]);
    expect(getBridgeConfig(CHIADO).routerRPC).toEqual([ETH_GOOD]);
    expect(getBridgeConfig(SEPOLIA).inboxRPC).toEqual([ARB_GOOD]);
    expect(getBridgeConfig(CHIADO).inboxRPC).toEqual([ARB_GOOD]);
    // Each unreachable URL is probed once, not once per list it appeared in.
    const probesOf = (url: string) =>
      createProvider.mock.calls.filter((call) => call[0].length === 1 && call[0][0] === url).length;
    expect(probesOf(ETH_DOWN)).toBe(1);
    expect(probesOf(ARB_DOWN)).toBe(1);
  });

  it("builds the contract and funding provider from the pruned list", async () => {
    const { getBridgeConfig } = loadBridgeRoutes({ RPC_ARB: ARB_GOOD, RPC_ETH: `${ETH_DOWN},${ETH_GOOD}` });
    const createProvider = providerFactory();

    await run(getBridgeConfig, [SEPOLIA], { createProvider });

    const listProviders = createProvider.mock.calls.map((call) => [...call[0]]);
    expect(listProviders).not.toContainEqual(expect.arrayContaining([ETH_DOWN, ETH_GOOD]));
  });

  it("keeps the first URL and prunes an unreachable backup", async () => {
    const { getBridgeConfig } = loadBridgeRoutes({ RPC_ARB: ARB_GOOD, RPC_ETH: `${ETH_GOOD},${ETH_DOWN}` });

    await run(getBridgeConfig, [SEPOLIA]);

    expect(getBridgeConfig(SEPOLIA).outboxRPC).toEqual([ETH_GOOD]);
  });

  it("is fatal when no URL of a list is reachable", async () => {
    const { getBridgeConfig } = loadBridgeRoutes({ RPC_ARB: ARB_GOOD, RPC_ETH: ETH_DOWN });

    const problems = await problemsFrom(run(getBridgeConfig, [SEPOLIA]));

    expect(problems).toEqual([expect.stringContaining("RPC_ETH has no reachable endpoint for chain 11155111 outbox")]);
    expect(problems.join("\n")).not.toContain(KEY);
  });

  it("is fatal for a list emptied by pruning an earlier list (shared RPC_ETH)", async () => {
    const { getBridgeConfig } = loadBridgeRoutes({ RPC_ARB: ARB_GOOD, RPC_ETH: ETH_DOWN, RPC_GNOSIS: GNO_GOOD });

    const problems = await problemsFrom(run(getBridgeConfig, [SEPOLIA, CHIADO]));

    expect(problems.some((p) => p.includes("RPC_ETH has no reachable endpoint for chain 11155111 outbox"))).toBe(true);
    expect(problems.some((p) => p.includes("RPC_ETH has no reachable endpoint for chain 10200 router"))).toBe(true);
  });

  it("stays fatal for a URL on the wrong chain even when another URL of the list is unreachable", async () => {
    const { getBridgeConfig } = loadBridgeRoutes({ RPC_ARB: ARB_GOOD, RPC_ETH: `${ETH_DOWN},${GNO_GOOD}` });

    const problems = await problemsFrom(run(getBridgeConfig, [SEPOLIA]));

    expect(problems.some((p) => p.includes("RPC_ETH endpoint 2") && p.includes(`expected ${SEPOLIA}`))).toBe(true);
  });

  it("is fatal for the Chiado outbox when its only URL is unreachable, even though other lists are fine", async () => {
    const { getBridgeConfig } = loadBridgeRoutes({ RPC_ARB: ARB_GOOD, RPC_ETH: ETH_GOOD, RPC_GNOSIS: GNO_DOWN });

    const problems = await problemsFrom(run(getBridgeConfig, [CHIADO]));

    expect(problems).toEqual([expect.stringContaining("RPC_GNOSIS has no reachable endpoint for chain 10200 outbox")]);
  });
});

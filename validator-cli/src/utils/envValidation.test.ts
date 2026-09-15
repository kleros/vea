import { validateEnvironment, defaultCreateProvider } from "./envValidation";
import { EnvValidationError } from "./errors";
import { Network } from "../consts/bridgeRoutes";

// A funded, well-formed baseline that every test mutates one field of, so each
// test states exactly the one thing it is about.
const VALID_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const SIGNER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

const SEPOLIA = 11155111;
const CHIADO = 10200;
const ARB_SEPOLIA = 421614;

const validEnv = (): Record<string, string> => ({
  PRIVATE_KEY: VALID_KEY,
  VEAOUTBOX_CHAINS: String(SEPOLIA),
  NETWORKS: "testnet",
  ENVIO_URL: "http://localhost:8080/v1/graphql",
  RPC_ARB: "https://arb.example/rpc",
  RPC_ETH: "https://eth.example/rpc",
});

const bridgeFor = (chainId: number) =>
  chainId === CHIADO
    ? {
        chain: "chiado",
        inboxChainId: ARB_SEPOLIA,
        routerChainId: SEPOLIA,
        inboxRPC: ["https://arb.example/rpc"],
        outboxRPC: ["https://gno.example/rpc"],
        routerRPC: ["https://eth.example/rpc"],
        rpcEnvVars: { inbox: "RPC_ARB", outbox: "RPC_GNOSIS", router: "RPC_ETH" },
        depositTokenEnvVar: "GNOSIS_WETH",
        depositToken: "0x8d74e5e4DA11629537C4575cB0f33b4F0Dfa42EB",
        routeConfig: {
          [Network.TESTNET]: { veaInbox: { address: "0xInbox" }, veaOutbox: { address: "0xOutbox" }, deposit: 10n },
        },
      }
    : {
        chain: "sepolia",
        inboxChainId: ARB_SEPOLIA,
        inboxRPC: ["https://arb.example/rpc"],
        outboxRPC: ["https://eth.example/rpc"],
        rpcEnvVars: { inbox: "RPC_ARB", outbox: "RPC_ETH" },
        routeConfig: {
          [Network.TESTNET]: { veaInbox: { address: "0xInbox" }, veaOutbox: { address: "0xOutbox" }, deposit: 10n },
        },
      };

/** A preflight provider that answers everything correctly. */
const healthyProvider = (chainId: number) => ({
  getNetwork: jest.fn(async () => ({ chainId })),
  getCode: jest.fn(async () => "0x6080604052"),
  getBalance: jest.fn(async () => 1_000_000_000_000_000_000n),
});

const deps = (overrides: any = {}) => ({
  env: validEnv(),
  fetchBridgeConfig: jest.fn(bridgeFor) as any,
  createProvider: jest.fn((_urls: string[], chainId: number) => healthyProvider(chainId)) as any,
  readDepositTokenBalance: jest.fn(async () => ({ balance: 10n, allowance: 10n })),
  ...overrides,
});

const problemsFrom = async (params: any): Promise<string[]> => {
  try {
    await validateEnvironment(params);
  } catch (error) {
    if (error instanceof EnvValidationError) return error.problems;
    throw error;
  }
  throw new Error("expected validateEnvironment to reject");
};

describe("envValidation", () => {
  describe("static checks", () => {
    it("accepts a well-formed environment and reports the derived signer address", async () => {
      const result = await validateEnvironment(deps());

      expect(result.signerAddress).toEqual(SIGNER);
      expect(result.chainIds).toEqual([SEPOLIA]);
      expect(result.networks).toEqual([Network.TESTNET]);
    });

    it("rejects an empty NETWORKS instead of silently watching nothing", async () => {
      const problems = await problemsFrom(deps({ env: { ...validEnv(), NETWORKS: "" } }));

      expect(problems.some((p) => p.includes("NETWORKS"))).toBe(true);
    });

    it("rejects an absent NETWORKS", async () => {
      const env = validEnv();
      delete env.NETWORKS;

      const problems = await problemsFrom(deps({ env }));

      expect(problems.some((p) => p.includes("NETWORKS"))).toBe(true);
    });

    it("rejects an empty VEAOUTBOX_CHAINS instead of crashing later on an undefined config", async () => {
      const problems = await problemsFrom(deps({ env: { ...validEnv(), VEAOUTBOX_CHAINS: "" } }));

      expect(problems.some((p) => p.includes("VEAOUTBOX_CHAINS"))).toBe(true);
    });

    it("rejects a chain id that has no configured bridge", async () => {
      const fetchBridgeConfig = jest.fn((chainId: number) => {
        if (chainId !== SEPOLIA && chainId !== CHIADO) throw new Error("Bridge not found for chain");
        return bridgeFor(chainId);
      });

      const problems = await problemsFrom(
        deps({ env: { ...validEnv(), VEAOUTBOX_CHAINS: `${SEPOLIA},421611` }, fetchBridgeConfig })
      );

      expect(problems.some((p) => p.includes("421611"))).toBe(true);
    });

    it("rejects a network outside the Network enum", async () => {
      const problems = await problemsFrom(deps({ env: { ...validEnv(), NETWORKS: "testnet,mainnet" } }));

      expect(problems.some((p) => p.includes("mainnet"))).toBe(true);
    });

    it("reports every problem at once rather than only the first", async () => {
      const problems = await problemsFrom(
        deps({ env: { PRIVATE_KEY: "not-a-key", VEAOUTBOX_CHAINS: "", NETWORKS: "", ENVIO_URL: "" } })
      );

      expect(problems.length).toBeGreaterThanOrEqual(4);
      for (const name of ["PRIVATE_KEY", "VEAOUTBOX_CHAINS", "NETWORKS", "ENVIO_URL"]) {
        expect(problems.some((p) => p.includes(name))).toBe(true);
      }
    });

    it("rejects a malformed PRIVATE_KEY without echoing it", async () => {
      const secret = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef00";

      const problems = await problemsFrom(deps({ env: { ...validEnv(), PRIVATE_KEY: secret } }));

      expect(problems.some((p) => p.includes("PRIVATE_KEY"))).toBe(true);
      expect(problems.join("\n")).not.toContain(secret);
    });

    it("rejects a missing ENVIO_URL, which the subgraph fallback asserts is present", async () => {
      const env = validEnv();
      delete env.ENVIO_URL;

      const problems = await problemsFrom(deps({ env }));

      expect(problems.some((p) => p.includes("ENVIO_URL"))).toBe(true);
    });

    it("rejects an RPC list that is empty for a configured chain", async () => {
      const fetchBridgeConfig = jest.fn(() => ({ ...bridgeFor(SEPOLIA), outboxRPC: [] })) as any;

      const problems = await problemsFrom(deps({ env: { ...validEnv(), RPC_ETH: "" }, fetchBridgeConfig }));

      expect(problems.some((p) => p.includes("RPC_ETH"))).toBe(true);
    });

    it("rejects an RPC endpoint that is not an http(s) URL", async () => {
      const fetchBridgeConfig = jest.fn(() => ({ ...bridgeFor(SEPOLIA), outboxRPC: ["ws://eth.example"] })) as any;

      const problems = await problemsFrom(deps({ fetchBridgeConfig }));

      expect(problems.some((p) => p.includes("RPC_ETH"))).toBe(true);
    });

    it("requires GNOSIS_WETH only when the Chiado route is configured", async () => {
      const withoutChiado = await validateEnvironment(deps());
      expect(withoutChiado.signerAddress).toEqual(SIGNER);

      const fetchBridgeConfig = jest.fn(() => ({ ...bridgeFor(CHIADO), depositToken: undefined })) as any;
      const problems = await problemsFrom(
        deps({
          env: { ...validEnv(), VEAOUTBOX_CHAINS: String(CHIADO), RPC_GNOSIS: "https://gno.example/rpc" },
          fetchBridgeConfig,
        })
      );

      expect(problems.some((p) => p.includes("GNOSIS_WETH"))).toBe(true);
    });

    it("makes no network calls when a static check has already failed", async () => {
      const createProvider = jest.fn();

      await problemsFrom(deps({ env: { ...validEnv(), NETWORKS: "" }, createProvider }));

      expect(createProvider).not.toHaveBeenCalled();
    });
  });

  describe("preflight", () => {
    it("probes the inbox and outbox endpoints, not just the outbox", async () => {
      const createProvider = jest.fn((_urls: string[], chainId: number) => healthyProvider(chainId));

      await validateEnvironment(deps({ createProvider }));

      const probedChains = createProvider.mock.calls.map((call: any[]) => call[1]);
      expect(probedChains).toContain(SEPOLIA);
      expect(probedChains).toContain(ARB_SEPOLIA);
    });

    it("rejects an endpoint pointed at the wrong chain", async () => {
      const createProvider = jest.fn((_urls: string[], chainId: number) => ({
        ...healthyProvider(chainId),
        // The outbox RPC actually answers as mainnet.
        getNetwork: jest.fn(async () => ({ chainId: chainId === SEPOLIA ? 1 : chainId })),
      }));

      const problems = await problemsFrom(deps({ createProvider }));

      expect(problems.some((p) => p.includes("RPC_ETH") && p.includes("1"))).toBe(true);
    });

    it("accepts a chain id reported as a bigint", async () => {
      const createProvider = jest.fn((_urls: string[], chainId: number) => ({
        ...healthyProvider(chainId),
        getNetwork: jest.fn(async () => ({ chainId: BigInt(chainId) })),
      }));

      const result = await validateEnvironment(deps({ createProvider }));

      expect(result.signerAddress).toEqual(SIGNER);
    });

    it("rejects an address with no contract code deployed at it", async () => {
      const createProvider = jest.fn((_urls: string[], chainId: number) => ({
        ...healthyProvider(chainId),
        getCode: jest.fn(async () => "0x"),
      }));

      const problems = await problemsFrom(deps({ createProvider }));

      expect(problems.some((p) => p.includes("no contract code"))).toBe(true);
    });

    it("rejects a signer with no native balance for gas", async () => {
      const createProvider = jest.fn((_urls: string[], chainId: number) => ({
        ...healthyProvider(chainId),
        getBalance: jest.fn(async () => 0n),
      }));

      const problems = await problemsFrom(deps({ createProvider }));

      expect(problems.some((p) => p.includes("no native balance"))).toBe(true);
    });

    it("warns rather than refuses when the native balance is below the route deposit", async () => {
      const createProvider = jest.fn((_urls: string[], chainId: number) => ({
        ...healthyProvider(chainId),
        getBalance: jest.fn(async () => 1n), // non-zero, but under the deposit of 10n
      }));

      const result = await validateEnvironment(deps({ createProvider }));

      expect(result.warnings.some((w) => w.includes("below the deposit"))).toBe(true);
    });

    it("checks the deposit token balance for a route whose deposit is not native", async () => {
      const readDepositTokenBalance = jest.fn(async () => ({ balance: 1n, allowance: 0n }));
      const fetchBridgeConfig = jest.fn(() => bridgeFor(CHIADO)) as any;

      const result = await validateEnvironment(
        deps({
          env: { ...validEnv(), VEAOUTBOX_CHAINS: String(CHIADO), RPC_GNOSIS: "https://gno.example/rpc" },
          fetchBridgeConfig,
          readDepositTokenBalance,
        })
      );

      expect(readDepositTokenBalance).toHaveBeenCalled();
      expect(result.warnings.some((w) => w.includes("below the deposit"))).toBe(true);
    });

    it("reports a configured network that the route has no deployment for", async () => {
      const problems = await problemsFrom(deps({ env: { ...validEnv(), NETWORKS: "devnet" } }));

      expect(problems.some((p) => p.includes("devnet"))).toBe(true);
    });

    it("collects preflight problems across every configured chain before failing", async () => {
      const createProvider = jest.fn((_urls: string[], chainId: number) => ({
        ...healthyProvider(chainId),
        getCode: jest.fn(async () => "0x"),
        getBalance: jest.fn(async () => 0n),
      }));
      const fetchBridgeConfig = jest.fn(bridgeFor) as any;

      const problems = await problemsFrom(
        deps({
          env: { ...validEnv(), VEAOUTBOX_CHAINS: `${SEPOLIA},${CHIADO}`, RPC_GNOSIS: "https://gno.example/rpc" },
          fetchBridgeConfig,
          createProvider,
        })
      );

      expect(problems.some((p) => p.includes(String(SEPOLIA)))).toBe(true);
      expect(problems.some((p) => p.includes(String(CHIADO)))).toBe(true);
    });
  });

  describe("against the real bridge configuration", () => {
    // The fixtures above describe what the bridge config is expected to look
    // like; this checks the shipped config actually looks that way, so a route
    // added without rpcEnvVars or inboxChainId fails here rather than at startup.
    it("validates both shipped routes across both networks", async () => {
      jest.resetModules();
      process.env.RPC_ARB = "https://arb.example/rpc";
      process.env.RPC_ETH = "https://eth.example/rpc";
      process.env.RPC_GNOSIS = "https://gno.example/rpc";
      process.env.GNOSIS_WETH = "0x8d74e5e4DA11629537C4575cB0f33b4F0Dfa42EB";
      const { getBridgeConfig } = require("../consts/bridgeRoutes");
      const { validateEnvironment: freshValidate } = require("./envValidation");

      const result = await freshValidate({
        env: { ...validEnv(), VEAOUTBOX_CHAINS: `${SEPOLIA},${CHIADO}`, NETWORKS: "devnet,testnet" },
        fetchBridgeConfig: getBridgeConfig,
        createProvider: (_urls: string[], chainId: number) => healthyProvider(chainId),
        readDepositTokenBalance: async () => ({ balance: 10n ** 18n, allowance: 10n ** 18n }),
      });

      expect(result.chainIds).toEqual([SEPOLIA, CHIADO]);
      expect(result.networks).toEqual([Network.DEVNET, Network.TESTNET]);
      expect(result.warnings).toEqual([]);
    });
  });

  describe("defaultCreateProvider", () => {
    it("builds a provider that asks the endpoint for its chain id rather than trusting config", async () => {
      const provider: any = defaultCreateProvider(["https://eth.example/rpc"], SEPOLIA);
      const methods: string[] = [];
      // Stub the transport, not the provider: this proves a request is actually made.
      provider._send = jest.fn(async (payload: any) => {
        methods.push(payload.method);
        return [{ id: payload.id, result: "0x1" }]; // the endpoint answers as mainnet
      });

      const network = await provider.getNetwork();

      // A provider pinned to a static chain id answers from config and never
      // sends, which would make the whole chain-id preflight vacuous.
      expect(methods).toContain("eth_chainId");
      expect(Number(network.chainId)).toBe(1);
    });
  });
});

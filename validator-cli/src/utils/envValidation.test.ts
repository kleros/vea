import { validateEnvironment, defaultCreateProvider, PARITY_PROBE_CLAIM } from "./envValidation";
import { hashClaim } from "./claim";
import { EnvValidationError } from "./errors";
import { Network } from "../consts/bridgeRoutes";
import { ethers } from "ethers";
import { EventEmitter } from "node:events";
import { BotEvents } from "./botEvents";
import veaOutboxArbToEthTestnet from "../../../contracts/deployments/sepolia/VeaOutboxArbToEthTestnet.json";

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
  readOutboxHashClaim: jest.fn(async () => hashClaim(PARITY_PROBE_CLAIM as any)),
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

    it("accepts a chain id reported as a bigint", async () => {
      const createProvider = jest.fn((_urls: string[], chainId: number) => ({
        ...healthyProvider(chainId),
        getNetwork: jest.fn(async () => ({ chainId: BigInt(chainId) })),
      }));

      const result = await validateEnvironment(deps({ createProvider }));

      expect(result.signerAddress).toEqual(SIGNER);
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
          readOutboxHashClaim: jest.fn(async () => ethers.ZeroHash),
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
        readOutboxHashClaim: async () => hashClaim(PARITY_PROBE_CLAIM as any),
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

const KEY = "a1b2c3d4e5f6SECRETKEY";
const ETH_PRIMARY = `https://eth-primary.example/v3/${KEY}?apikey=${KEY}`;
const ETH_BACKUP = `https://user:${KEY}@eth-backup.example/rpc/${KEY}?token=${KEY}`;
const ARB = "https://arb.example/rpc";
const GNO = "https://gno.example/rpc";
const OUTBOX = veaOutboxArbToEthTestnet.address;

const st_env = (overrides: Record<string, string> = {}): Record<string, string> => ({
  PRIVATE_KEY: VALID_KEY,
  VEAOUTBOX_CHAINS: String(SEPOLIA),
  NETWORKS: "testnet",
  ENVIO_URL: "http://localhost:8080/v1/graphql",
  ...overrides,
});

const sepoliaBridge = (outboxRPC: string[] = [ETH_PRIMARY, ETH_BACKUP]) => ({
  inboxChainId: ARB_SEPOLIA,
  inboxRPC: [ARB],
  outboxRPC,
  rpcEnvVars: { inbox: "RPC_ARB", outbox: "RPC_ETH" },
  routeConfig: {
    [Network.TESTNET]: {
      veaInbox: { address: "0x00000000000000000000000000000000000000a1" },
      veaOutbox: { address: OUTBOX, abi: veaOutboxArbToEthTestnet.abi },
      deposit: 10n,
    },
  },
});

const chiadoBridge = () => ({
  inboxChainId: ARB_SEPOLIA,
  routerChainId: SEPOLIA,
  inboxRPC: [ARB],
  outboxRPC: [GNO],
  routerRPC: [ETH_PRIMARY],
  rpcEnvVars: { inbox: "RPC_ARB", outbox: "RPC_GNOSIS", router: "RPC_ETH" },
  depositToken: "0x8d74e5e4DA11629537C4575cB0f33b4F0Dfa42EB",
  routeConfig: {
    [Network.TESTNET]: {
      veaInbox: { address: "0x00000000000000000000000000000000000000a1" },
      veaOutbox: { address: "0x00000000000000000000000000000000000000b2" },
      deposit: 10n,
    },
  },
});

/** Which chain each URL really serves, and the signer's balance there. */
type FakeEndpoint = { chainId: number; balance?: bigint; down?: boolean };

const providerFactory = (endpoints: Record<string, FakeEndpoint>) =>
  jest.fn((urls: string[], _expected: number) => {
    const served = endpoints[urls[0]];
    return {
      getNetwork: jest.fn(async () => {
        if (served.down) throw new Error(`missing response (url="${urls[0]}")`);
        return { chainId: served.chainId };
      }),
      getCode: jest.fn(async () => "0x6080"),
      getBalance: jest.fn(async () => served.balance ?? 10n ** 18n),
    };
  });

const healthy: Record<string, FakeEndpoint> = {
  [ETH_PRIMARY]: { chainId: SEPOLIA },
  [ETH_BACKUP]: { chainId: SEPOLIA },
  [ARB]: { chainId: ARB_SEPOLIA },
  [GNO]: { chainId: CHIADO },
};

const st_params = (overrides: any = {}) => ({
  env: st_env(),
  fetchBridgeConfig: jest.fn((chainId: number) => (chainId === CHIADO ? chiadoBridge() : sepoliaBridge())) as any,
  createProvider: providerFactory(healthy) as any,
  readDepositTokenBalance: jest.fn(async () => ({ balance: 10n, allowance: 10n })),
  readOutboxHashClaim: jest.fn(async () => hashClaim(PARITY_PROBE_CLAIM as any)),
  emitter: new EventEmitter(),
  ...overrides,
});

const st_problemsFrom = async (p: any): Promise<string[]> => {
  try {
    await validateEnvironment(p);
  } catch (error) {
    if (error instanceof EnvValidationError) return error.problems;
    throw error;
  }
  throw new Error("expected validateEnvironment to reject");
};

/**
 * A provider whose `eth_call` runs `hashClaim` the way the deployed outbox does
 * (`keccak256(abi.encodePacked(...))`), decoding the calldata with the real
 * deployment ABI. `drift` simulates a contract that hashes differently.
 */
const contractLikeProvider = (drift = false) => {
  const iface = new ethers.Interface(veaOutboxArbToEthTestnet.abi);
  return {
    getNetwork: jest.fn(async () => ({ chainId: SEPOLIA })),
    getCode: jest.fn(async () => "0x6080"),
    getBalance: jest.fn(async () => 10n ** 18n),
    call: jest.fn(async (tx: { to: string; data: string }) => {
      const [claim] = iface.decodeFunctionData("hashClaim", tx.data);
      const fields = [
        claim.stateRoot,
        claim.claimer,
        claim.timestampClaimed,
        claim.timestampVerification,
        claim.blocknumberVerification,
        claim.honest,
        claim.challenger,
      ];
      const types = ["bytes32", "address", "uint32", "uint32", "uint32", "uint8", "address"];
      // The drifted contract widens one field, which a packed encoding notices.
      if (drift) types[4] = "uint64";
      return iface.encodeFunctionResult("hashClaim", [ethers.solidityPackedKeccak256(types, fields)]);
    }),
  };
};

describe("validateEnvironment: endpoint probes, contract identity, redaction", () => {
  describe("problems and warnings name endpoints as scheme://host", () => {
    it("redacts a keyed URL in a wrong-chain problem", async () => {
      const createProvider = providerFactory({ ...healthy, [ETH_BACKUP]: { chainId: 1 } });

      const problems = await st_problemsFrom(st_params({ createProvider }));

      expect(problems.some((p) => p.includes("https://eth-backup.example") && p.includes("chain 1"))).toBe(true);
      expect(problems.join("\n")).not.toContain(KEY);
    });

    it("redacts a keyed URL quoted inside an endpoint's error message", async () => {
      // An unreachable URL with a reachable sibling is a warning, not a problem.
      const createProvider = providerFactory({ ...healthy, [ETH_PRIMARY]: { chainId: SEPOLIA, down: true } });

      const result = await validateEnvironment(st_params({ createProvider }));

      expect(result.warnings.some((w) => w.includes("unreachable"))).toBe(true);
      expect(result.warnings.join("\n")).not.toContain(KEY);
    });

    it("redacts a keyed URL quoted inside the error of a list with no reachable endpoint", async () => {
      const createProvider = providerFactory({
        ...healthy,
        [ETH_PRIMARY]: { chainId: SEPOLIA, down: true },
        [ETH_BACKUP]: { chainId: SEPOLIA, down: true },
      });

      const problems = await st_problemsFrom(st_params({ createProvider }));

      expect(problems.some((p) => p.includes("RPC_ETH has no reachable endpoint"))).toBe(true);
      expect(problems.join("\n")).not.toContain(KEY);
    });

    it("redacts a keyed URL that is not http(s)", async () => {
      const fetchBridgeConfig = jest.fn(() => sepoliaBridge([`wss://eth.example/ws/${KEY}?k=${KEY}`]));

      const problems = await st_problemsFrom(st_params({ fetchBridgeConfig }));

      expect(problems.some((p) => p.includes("RPC_ETH") && p.includes("wss://eth.example"))).toBe(true);
      expect(problems.join("\n")).not.toContain(KEY);
    });

    it("redacts a keyed URL in a funding warning", async () => {
      const createProvider = jest.fn((urls: string[]) => ({
        getNetwork: jest.fn(async () => ({ chainId: healthy[urls[0]].chainId })),
        getCode: jest.fn(async () => "0x6080"),
        getBalance: jest.fn(async () => {
          throw new Error(`timeout (url="${urls[urls.length - 1]}")`);
        }),
      }));

      const result = await validateEnvironment(st_params({ createProvider }));

      expect(result.warnings.some((w) => w.includes("balance check failed"))).toBe(true);
      expect(result.warnings.join("\n")).not.toContain(KEY);
    });
  });

  describe("every URL is probed on its own", () => {
    it("asks each URL of a list for its chain id separately", async () => {
      const createProvider = providerFactory(healthy);

      await validateEnvironment(st_params({ createProvider }));

      const singleUrlProbes = createProvider.mock.calls
        .filter((call) => call[0].length === 1)
        .map((call) => call[0][0]);
      expect(singleUrlProbes).toEqual(expect.arrayContaining([ETH_PRIMARY, ETH_BACKUP, ARB]));
    });

    it("rejects a backup URL on the wrong chain even when the primary is right", async () => {
      const createProvider = providerFactory({ ...healthy, [ETH_BACKUP]: { chainId: 1 } });

      const problems = await st_problemsFrom(st_params({ createProvider }));

      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("RPC_ETH endpoint 2");
      expect(problems[0]).toContain(`expected ${SEPOLIA}`);
    });

    it("rejects a router URL on the wrong chain", async () => {
      const createProvider = providerFactory({ ...healthy, [ETH_PRIMARY]: { chainId: 1 } });
      const fetchBridgeConfig = jest.fn(() => chiadoBridge());

      const problems = await st_problemsFrom(
        st_params({ env: st_env({ VEAOUTBOX_CHAINS: String(CHIADO) }), fetchBridgeConfig, createProvider })
      );

      expect(problems.some((p) => p.includes("RPC_ETH endpoint 1") && p.includes("router"))).toBe(true);
    });
  });

  describe("hashClaim parity probe on the outbox", () => {
    it("accepts an outbox whose hashClaim matches the local one, without a getCode check on it", async () => {
      const readOutboxHashClaim = jest.fn(async () => hashClaim(PARITY_PROBE_CLAIM as any));
      const createProvider = providerFactory(healthy);

      await validateEnvironment(st_params({ readOutboxHashClaim, createProvider }));

      expect(readOutboxHashClaim).toHaveBeenCalledWith(
        OUTBOX,
        veaOutboxArbToEthTestnet.abi,
        PARITY_PROBE_CLAIM,
        expect.anything()
      );
      const outboxListProvider = createProvider.mock.results.find(
        (_r, i) => createProvider.mock.calls[i][0].length === 2
      )!.value;
      expect(outboxListProvider.getCode).not.toHaveBeenCalled();
    });

    it("rejects an outbox whose hashClaim differs (wrong address, ABI or encoding)", async () => {
      const problems = await st_problemsFrom(st_params({ readOutboxHashClaim: jest.fn(async () => ethers.ZeroHash) }));

      expect(problems.some((p) => p.includes("outbox") && p.includes("hashClaim parity"))).toBe(true);
    });

    it("rejects an outbox whose hashClaim call fails (no code, not an outbox)", async () => {
      const readOutboxHashClaim = jest.fn(async () => {
        throw new Error('could not decode result data (value="0x")');
      });

      const problems = await st_problemsFrom(st_params({ readOutboxHashClaim }));

      expect(problems.some((p) => p.includes("hashClaim parity") && p.includes("could not decode"))).toBe(true);
    });

    it("probes through the real deployment ABI and accepts a contract that hashes like the validator", async () => {
      const createProvider = jest.fn((urls: string[]) =>
        urls.length === 2 ? contractLikeProvider() : providerFactory(healthy)(urls, 0)
      );
      const p = st_params({ createProvider });
      delete p.readOutboxHashClaim; // use the default reader

      const result = await validateEnvironment(p);

      expect(result.chainIds).toEqual([SEPOLIA]);
    });

    it("probes through the real deployment ABI and rejects a contract whose encoding drifted", async () => {
      const createProvider = jest.fn((urls: string[]) =>
        urls.length === 2 ? contractLikeProvider(true) : providerFactory(healthy)(urls, 0)
      );
      const p = st_params({ createProvider });
      delete p.readOutboxHashClaim;

      const problems = await st_problemsFrom(p);

      expect(problems.some((p) => p.includes("hashClaim parity"))).toBe(true);
    });
  });

  describe("a zero native balance is fatal", () => {
    it("refuses to start, naming the unfunded route, and raises no route_unfunded alert", async () => {
      const emitter = new EventEmitter();
      const alerts: any[] = [];
      emitter.on(BotEvents.ALERT, (payload) => alerts.push(payload));
      const createProvider = providerFactory({ ...healthy, [GNO]: { chainId: CHIADO, balance: 0n } });

      const problems = await st_problemsFrom(
        st_params({ env: st_env({ VEAOUTBOX_CHAINS: `${SEPOLIA},${CHIADO}` }), createProvider, emitter })
      );

      expect(problems.some((p) => p.includes("no native balance") && p.includes(String(CHIADO)))).toBe(true);
      expect(problems.some((p) => p.includes("no native balance") && p.includes(`chain ${SEPOLIA} `))).toBe(false);
      expect(alerts.filter((a) => a.code === "route_unfunded")).toEqual([]);
    });

    it("counts the router chain: a zero Sepolia balance on the Chiado route is fatal (dispute tickets execute there)", async () => {
      const createProvider = providerFactory({ ...healthy, [ETH_PRIMARY]: { chainId: SEPOLIA, balance: 0n } });

      const problems = await st_problemsFrom(
        st_params({ env: st_env({ VEAOUTBOX_CHAINS: `${CHIADO}` }), createProvider })
      );

      expect(problems.some((p) => p.includes("no native balance") && p.includes("router"))).toBe(true);
    });
  });

  describe("HEARTBEAT_URL", () => {
    it("accepts an https URL and an unset value", async () => {
      await expect(
        validateEnvironment(st_params({ env: st_env({ HEARTBEAT_URL: "https://hb.example/ping/x" }) }))
      ).resolves.toBeDefined();
      await expect(validateEnvironment(st_params({ env: st_env({ HEARTBEAT_URL: "" }) }))).resolves.toBeDefined();
    });

    it("rejects an http URL without echoing its token", async () => {
      const problems = await st_problemsFrom(
        st_params({ env: st_env({ HEARTBEAT_URL: `http://hb.example/ping/${KEY}` }) })
      );

      expect(problems.some((p) => p.includes("HEARTBEAT_URL") && p.includes("https"))).toBe(true);
      expect(problems.join("\n")).not.toContain(KEY);
    });

    it("rejects a value that is not a URL at all", async () => {
      const problems = await st_problemsFrom(st_params({ env: st_env({ HEARTBEAT_URL: `hb.example/${KEY}` }) }));

      expect(problems.some((p) => p.includes("HEARTBEAT_URL"))).toBe(true);
      expect(problems.join("\n")).not.toContain(KEY);
    });
  });
});

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

const ur_providerFactory = (served: Record<string, Served> = SERVED) =>
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
  let routes: typeof import("../consts/bridgeRoutes") | undefined;
  jest.isolateModules(() => {
    routes = require("../consts/bridgeRoutes");
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
    createProvider: ur_providerFactory() as any,
    readDepositTokenBalance: async () => ({ balance: 10n ** 18n, allowance: 10n ** 18n }),
    readOutboxHashClaim: async () => hashClaim(PARITY_PROBE_CLAIM as any),
    emitter: new EventEmitter(),
    ...overrides,
  });

const ur_problemsFrom = async (promise: Promise<unknown>): Promise<string[]> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof EnvValidationError) return error.problems;
    throw error;
  }
  throw new Error("expected validateEnvironment to reject");
};

describe("validateEnvironment: an unreachable RPC URL is pruned, not fatal", () => {
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
    const createProvider = ur_providerFactory();

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
    const createProvider = ur_providerFactory();

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

    const problems = await ur_problemsFrom(run(getBridgeConfig, [SEPOLIA]));

    expect(problems).toEqual([expect.stringContaining("RPC_ETH has no reachable endpoint for chain 11155111 outbox")]);
    expect(problems.join("\n")).not.toContain(KEY);
  });

  it("is fatal for a list emptied by pruning an earlier list (shared RPC_ETH)", async () => {
    const { getBridgeConfig } = loadBridgeRoutes({ RPC_ARB: ARB_GOOD, RPC_ETH: ETH_DOWN, RPC_GNOSIS: GNO_GOOD });

    const problems = await ur_problemsFrom(run(getBridgeConfig, [SEPOLIA, CHIADO]));

    expect(problems.some((p) => p.includes("RPC_ETH has no reachable endpoint for chain 11155111 outbox"))).toBe(true);
    expect(problems.some((p) => p.includes("RPC_ETH has no reachable endpoint for chain 10200 router"))).toBe(true);
  });

  it("stays fatal for a URL on the wrong chain even when another URL of the list is unreachable", async () => {
    const { getBridgeConfig } = loadBridgeRoutes({ RPC_ARB: ARB_GOOD, RPC_ETH: `${ETH_DOWN},${GNO_GOOD}` });

    const problems = await ur_problemsFrom(run(getBridgeConfig, [SEPOLIA]));

    expect(problems.some((p) => p.includes("RPC_ETH endpoint 2") && p.includes(`expected ${SEPOLIA}`))).toBe(true);
  });

  it("is fatal for the Chiado outbox when its only URL is unreachable, even though other lists are fine", async () => {
    const { getBridgeConfig } = loadBridgeRoutes({ RPC_ARB: ARB_GOOD, RPC_ETH: ETH_GOOD, RPC_GNOSIS: GNO_DOWN });

    const problems = await ur_problemsFrom(run(getBridgeConfig, [CHIADO]));

    expect(problems).toEqual([expect.stringContaining("RPC_GNOSIS has no reachable endpoint for chain 10200 outbox")]);
  });
});

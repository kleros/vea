import { EventEmitter } from "node:events";
import { ethers } from "ethers";
import { validateEnvironment, PARITY_PROBE_CLAIM } from "../../utils/envValidation";
import { EnvValidationError } from "../../utils/errors";
import { hashClaim } from "../../utils/claim";
import { BotEvents } from "../../utils/botEvents";
import { Network } from "../../consts/bridgeRoutes";
import veaOutboxArbToEthTestnet from "../../../../contracts/deployments/sepolia/VeaOutboxArbToEthTestnet.json";

const VALID_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const SEPOLIA = 11155111;
const CHIADO = 10200;
const ARB_SEPOLIA = 421614;

const KEY = "a1b2c3d4e5f6SECRETKEY";
const ETH_PRIMARY = `https://eth-primary.example/v3/${KEY}?apikey=${KEY}`;
const ETH_BACKUP = `https://user:${KEY}@eth-backup.example/rpc/${KEY}?token=${KEY}`;
const ARB = "https://arb.example/rpc";
const GNO = "https://gno.example/rpc";
const OUTBOX = veaOutboxArbToEthTestnet.address;

const env = (overrides: Record<string, string> = {}): Record<string, string> => ({
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

const params = (overrides: any = {}) => ({
  env: env(),
  fetchBridgeConfig: jest.fn((chainId: number) => (chainId === CHIADO ? chiadoBridge() : sepoliaBridge())) as any,
  createProvider: providerFactory(healthy) as any,
  readDepositTokenBalance: jest.fn(async () => ({ balance: 10n, allowance: 10n })),
  readOutboxHashClaim: jest.fn(async () => hashClaim(PARITY_PROBE_CLAIM as any)),
  emitter: new EventEmitter(),
  ...overrides,
});

const problemsFrom = async (p: any): Promise<string[]> => {
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

describe("ops: startup validation", () => {
  describe("PRD 4.5: problems and warnings name endpoints as scheme://host", () => {
    it("redacts a keyed URL in a wrong-chain problem", async () => {
      const createProvider = providerFactory({ ...healthy, [ETH_BACKUP]: { chainId: 1 } });

      const problems = await problemsFrom(params({ createProvider }));

      expect(problems.some((p) => p.includes("https://eth-backup.example") && p.includes("chain 1"))).toBe(true);
      expect(problems.join("\n")).not.toContain(KEY);
    });

    it("redacts a keyed URL quoted inside an endpoint's error message", async () => {
      // #12: an unreachable URL with a reachable sibling is a warning, not a problem.
      const createProvider = providerFactory({ ...healthy, [ETH_PRIMARY]: { chainId: SEPOLIA, down: true } });

      const result = await validateEnvironment(params({ createProvider }));

      expect(result.warnings.some((w) => w.includes("unreachable"))).toBe(true);
      expect(result.warnings.join("\n")).not.toContain(KEY);
    });

    it("redacts a keyed URL quoted inside the error of a list with no reachable endpoint", async () => {
      const createProvider = providerFactory({
        ...healthy,
        [ETH_PRIMARY]: { chainId: SEPOLIA, down: true },
        [ETH_BACKUP]: { chainId: SEPOLIA, down: true },
      });

      const problems = await problemsFrom(params({ createProvider }));

      expect(problems.some((p) => p.includes("RPC_ETH has no reachable endpoint"))).toBe(true);
      expect(problems.join("\n")).not.toContain(KEY);
    });

    it("redacts a keyed URL that is not http(s)", async () => {
      const fetchBridgeConfig = jest.fn(() => sepoliaBridge([`wss://eth.example/ws/${KEY}?k=${KEY}`]));

      const problems = await problemsFrom(params({ fetchBridgeConfig }));

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

      const result = await validateEnvironment(params({ createProvider }));

      expect(result.warnings.some((w) => w.includes("balance check failed"))).toBe(true);
      expect(result.warnings.join("\n")).not.toContain(KEY);
    });
  });

  describe("PRD 4.6: every URL is probed on its own", () => {
    it("asks each URL of a list for its chain id separately", async () => {
      const createProvider = providerFactory(healthy);

      await validateEnvironment(params({ createProvider }));

      const singleUrlProbes = createProvider.mock.calls
        .filter((call) => call[0].length === 1)
        .map((call) => call[0][0]);
      expect(singleUrlProbes).toEqual(expect.arrayContaining([ETH_PRIMARY, ETH_BACKUP, ARB]));
    });

    it("rejects a backup URL on the wrong chain even when the primary is right", async () => {
      const createProvider = providerFactory({ ...healthy, [ETH_BACKUP]: { chainId: 1 } });

      const problems = await problemsFrom(params({ createProvider }));

      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("RPC_ETH endpoint 2");
      expect(problems[0]).toContain(`expected ${SEPOLIA}`);
    });

    it("rejects a router URL on the wrong chain", async () => {
      const createProvider = providerFactory({ ...healthy, [ETH_PRIMARY]: { chainId: 1 } });
      const fetchBridgeConfig = jest.fn(() => chiadoBridge());

      const problems = await problemsFrom(
        params({ env: env({ VEAOUTBOX_CHAINS: String(CHIADO) }), fetchBridgeConfig, createProvider })
      );

      expect(problems.some((p) => p.includes("RPC_ETH endpoint 1") && p.includes("router"))).toBe(true);
    });
  });

  describe("PRD 4.6: hashClaim parity probe on the outbox", () => {
    it("accepts an outbox whose hashClaim matches the local one, without a getCode check on it", async () => {
      const readOutboxHashClaim = jest.fn(async () => hashClaim(PARITY_PROBE_CLAIM as any));
      const createProvider = providerFactory(healthy);

      await validateEnvironment(params({ readOutboxHashClaim, createProvider }));

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
      const problems = await problemsFrom(params({ readOutboxHashClaim: jest.fn(async () => ethers.ZeroHash) }));

      expect(problems.some((p) => p.includes("outbox") && p.includes("hashClaim parity"))).toBe(true);
    });

    it("rejects an outbox whose hashClaim call fails (no code, not an outbox)", async () => {
      const readOutboxHashClaim = jest.fn(async () => {
        throw new Error('could not decode result data (value="0x")');
      });

      const problems = await problemsFrom(params({ readOutboxHashClaim }));

      expect(problems.some((p) => p.includes("hashClaim parity") && p.includes("could not decode"))).toBe(true);
    });

    it("probes through the real deployment ABI and accepts a contract that hashes like the validator", async () => {
      const createProvider = jest.fn((urls: string[]) =>
        urls.length === 2 ? contractLikeProvider() : providerFactory(healthy)(urls, 0)
      );
      const p = params({ createProvider });
      delete p.readOutboxHashClaim; // use the default reader

      const result = await validateEnvironment(p);

      expect(result.chainIds).toEqual([SEPOLIA]);
    });

    it("probes through the real deployment ABI and rejects a contract whose encoding drifted", async () => {
      const createProvider = jest.fn((urls: string[]) =>
        urls.length === 2 ? contractLikeProvider(true) : providerFactory(healthy)(urls, 0)
      );
      const p = params({ createProvider });
      delete p.readOutboxHashClaim;

      const problems = await problemsFrom(p);

      expect(problems.some((p) => p.includes("hashClaim parity"))).toBe(true);
    });
  });

  describe("PRD 4.8 (operator decision after run 004): a zero native balance is fatal", () => {
    it("refuses to start, naming the unfunded route, and raises no route_unfunded alert", async () => {
      const emitter = new EventEmitter();
      const alerts: any[] = [];
      emitter.on(BotEvents.ALERT, (payload) => alerts.push(payload));
      const createProvider = providerFactory({ ...healthy, [GNO]: { chainId: CHIADO, balance: 0n } });

      const problems = await problemsFrom(
        params({ env: env({ VEAOUTBOX_CHAINS: `${SEPOLIA},${CHIADO}` }), createProvider, emitter })
      );

      expect(problems.some((p) => p.includes("no native balance") && p.includes(String(CHIADO)))).toBe(true);
      expect(problems.some((p) => p.includes("no native balance") && p.includes(`chain ${SEPOLIA} `))).toBe(false);
      expect(alerts.filter((a) => a.code === "route_unfunded")).toEqual([]);
    });

    it("counts the router chain: a zero Sepolia balance on the Chiado route is fatal (dispute tickets execute there)", async () => {
      const createProvider = providerFactory({ ...healthy, [ETH_PRIMARY]: { chainId: SEPOLIA, balance: 0n } });

      const problems = await problemsFrom(params({ env: env({ VEAOUTBOX_CHAINS: `${CHIADO}` }), createProvider }));

      expect(problems.some((p) => p.includes("no native balance") && p.includes("router"))).toBe(true);
    });
  });

  describe("PRD 1.5: HEARTBEAT_URL", () => {
    it("accepts an https URL and an unset value", async () => {
      await expect(
        validateEnvironment(params({ env: env({ HEARTBEAT_URL: "https://hb.example/ping/x" }) }))
      ).resolves.toBeDefined();
      await expect(validateEnvironment(params({ env: env({ HEARTBEAT_URL: "" }) }))).resolves.toBeDefined();
    });

    it("rejects an http URL without echoing its token", async () => {
      const problems = await problemsFrom(params({ env: env({ HEARTBEAT_URL: `http://hb.example/ping/${KEY}` }) }));

      expect(problems.some((p) => p.includes("HEARTBEAT_URL") && p.includes("https"))).toBe(true);
      expect(problems.join("\n")).not.toContain(KEY);
    });

    it("rejects a value that is not a URL at all", async () => {
      const problems = await problemsFrom(params({ env: env({ HEARTBEAT_URL: `hb.example/${KEY}` }) }));

      expect(problems.some((p) => p.includes("HEARTBEAT_URL"))).toBe(true);
      expect(problems.join("\n")).not.toContain(KEY);
    });
  });
});

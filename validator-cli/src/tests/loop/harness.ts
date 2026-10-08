/**
 * Test harness for the watch loop. The test file must mock these modules first (see
 * `watcher.test.ts`): envValidation, logger, heartbeat, claim, claimer, validator, snapshot,
 * ethers, fallbackProvider, fallbackProviderV5, transactionHandlers, and bridgeRoutes with
 * RPC_ARB / RPC_ETH / RPC_GNOSIS set to the URLs below.
 */
import { EventEmitter } from "events";
import { watch, WatcherState } from "../../watcher";
import { ShutdownSignal } from "../../utils/shutdown";
import { createTwoChainRoute, TwoChainRoute } from "../../testUtils/twoChainFixture";
import { validateEnvironment } from "../../utils/envValidation";
import { sendHeartbeat } from "../../utils/heartbeat";
import { getClaim } from "../../utils/claim";
import { checkAndClaim } from "../../helpers/claimer";
import { challengeAndResolveClaim } from "../../helpers/validator";
import { saveSnapshot } from "../../helpers/snapshot";
import { FallbackProviderV5 } from "../../utils/fallbackProviderV5";
import { getTransactionHandler } from "../../utils/transactionHandlers";
import { EpochOutcome } from "../../utils/epochOutcome";

export const RPC = { arb: "https://arb.rpc.test", eth: "https://eth.rpc.test", gnosis: "https://gnosis.rpc.test" };

export const mocks = {
  validateEnvironment: validateEnvironment as jest.Mock,
  sendHeartbeat: sendHeartbeat as jest.Mock,
  getClaim: getClaim as jest.Mock,
  checkAndClaim: checkAndClaim as jest.Mock,
  challengeAndResolveClaim: challengeAndResolveClaim as jest.Mock,
  saveSnapshot: saveSnapshot as jest.Mock,
  FallbackProviderV5: FallbackProviderV5 as unknown as jest.Mock,
  getTransactionHandler: getTransactionHandler as jest.Mock,
};

/** Stands in for a route's transaction handler; records the options it was built with. */
export class FakeHandler {
  static built: FakeHandler[] = [];
  public claim: any = null;
  constructor(public opts: any) {
    Object.assign(this, opts);
    FakeHandler.built.push(this);
  }
}

export const fakeClaim = (timestampClaimed = 1, overrides: Record<string, unknown> = {}) => ({
  stateRoot: "0x" + "11".repeat(32),
  claimer: "0x" + "22".repeat(20),
  timestampClaimed,
  timestampVerification: 0,
  blocknumberVerification: 0,
  honest: 0,
  challenger: "0x" + "00".repeat(20),
  ...overrides,
});

export interface Harness {
  chains: TwoChainRoute;
  /** Outbox chain time of each route's chain: chain 10200 reads Chiado, chain 11155111 reads Sepolia. */
  now(chainId: number): number;
  /** Move every chain forward by `seconds` (a multiple of 60). */
  advance(seconds: number): void;
  /** The cycle being run (1-based). */
  cycle(): number;
  events: Array<{ name: string; payload: any; cycle: number }>;
  /** Every call to getClaim / checkAndClaim / challengeAndResolveClaim / saveSnapshot, with its cycle. */
  calls: Array<{ fn: string; cycle: number; chainId: number; epoch: number; params: any }>;
  /** Epochs `fn` was called with in `cycle` (optionally for one chain). */
  epochsOf(fn: string, cycle: number, chainId?: number): number[];
  eventsNamed(name: string): any[];
  state: WatcherState;
  signal: ShutdownSignal;
  /** Make the outbox provider of `chainId` throw on getBlock while `fails()` is true. */
  failOutbox(chainId: number, fails: () => boolean): void;
}

export interface RunOptions {
  chains: string; // VEAOUTBOX_CHAINS
  networks: string; // NETWORKS
  path?: "claimer" | "challenger" | "both";
  saveSnapshot?: boolean;
  cycles: number;
  now?: number;
  /** Runs at the start of each cycle (before any route is processed). */
  beforeCycle?: (cycle: number, h: Harness) => void;
  /** Runs before watch starts, once the harness exists. */
  setup?: (h: Harness) => void;
}

export const resetMocks = () => {
  // A watcher left running by an earlier test (e.g. one that hit its timeout) stops at its next
  // check instead of feeding this test's mocks.
  active?.signal.setShutdownSignal();
  jest.clearAllMocks();
  FakeHandler.built = [];
  mocks.validateEnvironment.mockResolvedValue({ signerAddress: "0xsigner", chainIds: [], networks: [], warnings: [] });
  mocks.getClaim.mockResolvedValue(null);
  mocks.checkAndClaim.mockResolvedValue(null);
  mocks.challengeAndResolveClaim.mockResolvedValue(null);
  mocks.saveSnapshot.mockImplementation(async ({ transactionHandler, count }: any) => ({
    updatedTransactionHandler: transactionHandler,
    latestCount: count,
  }));
  mocks.getTransactionHandler.mockImplementation(() => FakeHandler);
};

let active: Harness | undefined;
/** The harness of the running watcher, for mock implementations. */
export const harness = (): Harness => active!;

export const runWatcher = async (options: RunOptions): Promise<Harness> => {
  const chains = createTwoChainRoute(options.now === undefined ? {} : { now: options.now });
  const failing: { [url: string]: () => boolean } = {};
  const providerFor = (url: string) => {
    const base = url === RPC.arb ? chains.inbox : url === RPC.gnosis ? chains.outbox : chains.router;
    return {
      ...base.provider,
      name: base.name,
      getBlock: async (tag: any) => {
        if (failing[url]?.()) throw new Error(`rpc down at ${url}/v3/secret-key`);
        return base.provider.getBlock(tag);
      },
    };
  };
  mocks.FallbackProviderV5.mockImplementation((urls: string[]) => providerFor(urls[0]));

  const emitter = new EventEmitter();
  const events: Harness["events"] = [];
  const emit = emitter.emit.bind(emitter);
  emitter.emit = (name: string | symbol, ...args: any[]) => {
    events.push({ name: String(name), payload: args[0], cycle });
    return emit(name, ...args);
  };
  const signal = new ShutdownSignal();
  // No host timer between cycles: the run's speed never depends on the machine's timer resolution
  // or load. The cycle wait's own behaviour is tested in shutdown.test.ts and the SIGTERM test.
  signal.wait = async () => {};
  let cycle = 0;
  const state: WatcherState = { routes: {}, transactionHandlers: {} };
  const calls: Harness["calls"] = [];
  const h: Harness = {
    chains,
    now: (chainId) => (chainId === 10200 ? chains.outbox : chains.router).block("latest").timestamp,
    advance: (seconds) => {
      chains.inbox.advance(seconds / 0.25);
      chains.outbox.advance(seconds / 5);
      chains.router.advance(seconds / 12);
    },
    cycle: () => cycle,
    events,
    calls,
    epochsOf: (fn, c, chainId) =>
      calls
        .filter((x) => x.fn === fn && x.cycle === c && (chainId === undefined || x.chainId === chainId))
        .map((x) => x.epoch),
    eventsNamed: (name) => events.filter((e) => e.name === name).map((e) => e.payload),
    state,
    signal,
    failOutbox: (chainId, fails) => {
      failing[chainId === 10200 ? RPC.gnosis : RPC.eth] = fails;
    },
  };
  active = h;
  mocks.sendHeartbeat.mockImplementation(async (status: string) => {
    if (status !== "running") return;
    cycle++;
    if (cycle > options.cycles) signal.setShutdownSignal();
    else options.beforeCycle?.(cycle, h);
  });
  options.setup?.(h);
  const logged = {
    getClaim: mocks.getClaim,
    checkAndClaim: mocks.checkAndClaim,
    challengeAndResolveClaim: mocks.challengeAndResolveClaim,
    saveSnapshot: mocks.saveSnapshot,
  };
  for (const [fn, mock] of Object.entries(logged)) {
    const impl = mock.getMockImplementation();
    mock.mockImplementation((params: any) => {
      calls.push({ fn, cycle, chainId: params.chainId, epoch: params.epoch, params });
      return impl?.(params);
    });
  }

  process.argv = [
    "node",
    "watcher.ts",
    `--path=${options.path ?? "both"}`,
    ...(options.saveSnapshot ? ["--saveSnapshot"] : []),
  ];
  process.env.VEAOUTBOX_CHAINS = options.chains;
  process.env.NETWORKS = options.networks;
  process.env.HEARTBEAT_URL = "https://heartbeat.test/ping";

  await watch(signal, emitter as any, { cycleDelayMs: 0, state });
  return h;
};

export const reporting =
  (decide: (params: any) => EpochOutcome | undefined, returns: (params: any) => any = () => null) =>
  async (params: any) => {
    const outcome = decide(params);
    if (outcome !== undefined) params.reportOutcome?.(outcome);
    return returns(params);
  };

/**
 * BR-10: a sent snapshot that ends in `FailedResolution` is re-sent; one that did not is driven
 * to resolution.
 *
 * Attack: the fraudulent claimer sends a wrong-struct `sendSnapshot` W just before the
 * validator's correct one S. About 7 days later the attacker executes W on L1, which emits
 * `FailedResolution(epoch)` on the outbox. That event lands after S was sent, so the validator
 * blames S for it and re-sends, although S has not even been executed yet (its L2 -> L1
 * message is still not ready). The re-send resets the 7-day round trip and the bot stops
 * tracking S; repeating W before every re-send keeps the dispute open until the bridge times out.
 */
import { EventEmitter } from "events";
import { ethers } from "ethers";
import { ClaimStruct } from "../../contracts/typechain-types/arbitrumToEth/VeaInboxArbToEth";
import { getClaimResolveState, hashClaim, createClaimResolveCache } from "../src/utils/claim";
import { getBridgeConfig, Network } from "../src/consts/bridgeRoutes";
import { createTwoChainRoute, FakeChain } from "../src/testUtils/twoChainFixture";

const CHAIN_ID = 10200;
const routeConfig = getBridgeConfig(CHAIN_ID).routeConfig[Network.TESTNET];
const P = routeConfig.epochPeriod;
const inboxInterface = new ethers.Interface(routeConfig.veaInbox.abi);

// [L17] receipt fixture: the ArbSys `L2ToL1Tx` log `sendSnapshot` emits, forwarding
// `route(epoch, stateRoot, gasLimit, claim)` with the call's arguments, the inbox as caller.
const l2ToL1TxLog = (caller: string, sendSnapshotData: string) => {
  const claimTuple =
    "(bytes32 stateRoot, address claimer, uint32 timestampClaimed, uint32 timestampVerification, uint32 blocknumberVerification, uint8 honest, address challenger)";
  const arbSys = new ethers.Interface([
    "event L2ToL1Tx(address caller, address indexed destination, uint256 indexed hash, uint256 indexed position, uint256 arbBlockNum, uint256 ethBlockNum, uint256 timestamp, uint256 callvalue, bytes data)",
  ]);
  const router = new ethers.Interface([
    `function route(uint256 _epoch, bytes32 _stateRoot, uint256 _gasLimit, ${claimTuple} _claim)`,
  ]);
  const sent = inboxInterface.parseTransaction({ data: sendSnapshotData })!;
  const forwarded = router.encodeFunctionData("route", [sent.args[0], ethers.ZeroHash, sent.args[1], sent.args[2]]);
  const destination = "0x00000000000000000000000000000000000000c0";
  const log = arbSys.encodeEventLog("L2ToL1Tx", [caller, destination, 1, 1, 0, 0, 0, 0, forwarded]);
  return { address: "0x0000000000000000000000000000000000000064", topics: log.topics, data: log.data, index: 0 };
};

const blockAt = (chain: FakeChain, timestamp: number): number => {
  const head = chain.block("latest");
  return head.number - Math.ceil((head.timestamp - timestamp) / chain.options.secondsPerBlock);
};

const fakeContract = (chain: FakeChain, address: string) => {
  const logs: any[] = [];
  const filter = (event: string) => (epoch?: number) => ({ event, epoch });
  return {
    logs,
    getAddress: async () => address,
    filters: {
      SnapshotSent: filter("SnapshotSent"),
      FailedResolution: () => ({ event: "FailedResolution" }),
    },
    queryFilter: async (f: any, from: number, to: number) => {
      chain.assertOwnBlock(from);
      chain.assertOwnBlock(to);
      return logs.filter(
        (l) =>
          l.event === f.event &&
          l.blockNumber >= from &&
          l.blockNumber <= to &&
          (f.epoch == null || l.epoch === f.epoch)
      );
    },
  };
};

describe("BR-10: a FailedResolution of another ticket is not blamed on our unexecuted snapshot", () => {
  it("keeps the correct, not yet executed SnapshotSent instead of re-sending", async () => {
    const route = createTwoChainRoute();
    const epoch = Math.floor(route.outbox.block("latest").timestamp / P) - 3;
    const claim: ClaimStruct = {
      stateRoot: "0x" + "ab".repeat(32),
      claimer: "0x" + "22".repeat(20),
      timestampClaimed: (epoch + 1) * P + 600,
      timestampVerification: 0,
      blocknumberVerification: 0,
      honest: 0,
      challenger: "0x" + "11".repeat(20),
    };
    const veaOutbox: any = fakeContract(route.outbox, "0x00000000000000000000000000000000000000b0");
    veaOutbox.claimHashes = route.outbox.pinned(() => hashClaim(claim));

    const veaInbox: any = Object.assign(fakeContract(route.inbox, "0x00000000000000000000000000000000000000a0"), {
      interface: inboxInterface,
    });
    const txs: Record<string, { data: string; blockNumber: number }> = {};
    const send = (timestamp: number, label: string, carried: ClaimStruct) => {
      const blockNumber = blockAt(route.inbox, timestamp);
      const transactionHash = ethers.id(label);
      txs[transactionHash] = {
        blockNumber,
        data: inboxInterface.encodeFunctionData("sendSnapshot", [epoch, 3_000_000, carried]),
      };
      veaInbox.logs.push({
        event: "SnapshotSent",
        epoch,
        blockNumber,
        index: 0,
        transactionHash,
        data: ethers.ZeroHash,
        topics: [],
      });
      return transactionHash;
    };
    // The attacker's wrong ticket first, then our correct one.
    send((epoch + 1) * P + 1200, "attacker-wrong", { ...claim, challenger: ethers.ZeroAddress });
    const ours = send((epoch + 1) * P + 1800, "ours-correct", claim);
    // The attacker executes its wrong ticket on L1 after our send: FailedResolution on the outbox.
    veaOutbox.logs.push({
      event: "FailedResolution",
      blockNumber: blockAt(route.outbox, (epoch + 1) * P + 2400),
      index: 0,
      transactionHash: ethers.id("attacker-exec"),
      data: ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [epoch]),
      topics: [ethers.id("FailedResolution(uint256)")],
    });

    // Our ticket has not been executed: it cannot be the one that failed.
    const fetchMessageStatus = jest.fn(async () => 0);
    const state = await getClaimResolveState({
      chainId: CHAIN_ID,
      network: Network.TESTNET,
      veaInbox,
      veaInboxProvider: {
        ...route.inbox.provider,
        getTransaction: async (h: string) => txs[h] ?? null,
        getTransactionReceipt: async (h: string) => ({
          blockNumber: txs[h].blockNumber,
          logs: [l2ToL1TxLog(await veaInbox.getAddress(), txs[h].data)],
        }),
      } as any,
      veaOutbox,
      veaOutboxProvider: route.outbox.provider as any,
      l1Provider: route.router.provider as any,
      epoch,
      epochPeriod: P,
      emitter: new EventEmitter() as any,
      fetchMessageStatus: fetchMessageStatus as any,
      fetchSnapshotSentFromGraph: jest.fn(async () => undefined) as any,
      cache: createClaimResolveCache(),
    });

    expect(state.failedResolution?.detected ?? false).toBe(false);
    expect(state.sendSnapshot).toEqual({ status: true, txHash: ours });
  });
});

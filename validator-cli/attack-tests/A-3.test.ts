/**
 * BR-10 / A4 (provenance of a third-party SnapshotSent): the validator adopts a `SnapshotSent`
 * it did not send only after confirming the ticket carries the current claim struct.
 * `getSentSnapshotData` documents that it returns null for anything that "is not a direct
 * `sendSnapshot` call". A `SnapshotSent` emitted by the inbox inside a transaction sent to
 * another contract (a relay that passes its own claim to the inbox) carries calldata that says
 * nothing about the struct the inbox actually forwarded, so it must not be adopted.
 */
import { ethers } from "ethers";
import { getClaimResolveState, hashClaim, createClaimResolveCache } from "../src/utils/claim";
import { getBridgeConfig, Network } from "../src/consts/bridgeRoutes";
import { MockEmitter } from "../src/utils/emitter";

jest.mock("../src/utils/epochHandler", () => {
  const actual = jest.requireActual("../src/utils/epochHandler");
  return { ...actual, blockAtTimestamp: jest.fn(async () => 1) };
});

const EPOCH_PERIOD = 7200;
const EPOCH = 100;
const INBOX = "0x00000000000000000000000000000000000a11ce";
const RELAY = "0x000000000000000000000000000000000000beef";

const inboxInterface = new ethers.Interface(getBridgeConfig(11155111).routeConfig[Network.TESTNET].veaInbox.abi);

const currentClaim = {
  stateRoot: ethers.keccak256(ethers.toUtf8Bytes("fraud")),
  claimer: "0x1111111111111111111111111111111111111111",
  timestampClaimed: (EPOCH + 1) * EPOCH_PERIOD + 60,
  timestampVerification: 0,
  blocknumberVerification: 0,
  honest: 0,
  challenger: "0x2222222222222222222222222222222222222222",
};

// [L17] receipt fixture: the ArbSys `L2ToL1Tx` log `sendSnapshot` emits, forwarding
// `resolveDisputedClaim(epoch, stateRoot, claim)` for the struct carried, the inbox as caller.
const l2ToL1TxLog = (caller: string, epoch: number, carried: any) => {
  const claimTuple =
    "(bytes32 stateRoot, address claimer, uint32 timestampClaimed, uint32 timestampVerification, uint32 blocknumberVerification, uint8 honest, address challenger)";
  const arbSys = new ethers.Interface([
    "event L2ToL1Tx(address caller, address indexed destination, uint256 indexed hash, uint256 indexed position, uint256 arbBlockNum, uint256 ethBlockNum, uint256 timestamp, uint256 callvalue, bytes data)",
  ]);
  const outbox = new ethers.Interface([
    `function resolveDisputedClaim(uint256 _epoch, bytes32 _stateRoot, ${claimTuple} _claim)`,
  ]);
  const forwarded = outbox.encodeFunctionData("resolveDisputedClaim", [epoch, ethers.ZeroHash, carried]);
  const destination = "0x00000000000000000000000000000000000b0b00";
  const log = arbSys.encodeEventLog("L2ToL1Tx", [caller, destination, 1, 1, 0, 0, 0, 0, forwarded]);
  return { address: "0x0000000000000000000000000000000000000064", topics: log.topics, data: log.data, index: 0 };
};
// The struct the relay itself passes to the inbox: not the current claim.
const relayedClaim = { ...currentClaim, challenger: "0x3333333333333333333333333333333333333333" };

const setup = (txTo: string) => {
  const sentLog = { transactionHash: "0x" + "ab".repeat(32), blockNumber: 50, index: 0 };
  const now = (EPOCH + 5) * EPOCH_PERIOD;
  const veaInbox: any = {
    interface: inboxInterface,
    getAddress: async () => INBOX,
    filters: { SnapshotSent: () => ({ event: "SnapshotSent" }) },
    queryFilter: jest.fn(async (_f: any, lo: number, hi: number) => (lo <= 50 && 50 <= hi ? [sentLog] : [])),
  };
  const veaInboxProvider: any = {
    getBlock: jest.fn(async (tag: any) =>
      tag === 50 ? { number: 50, timestamp: (EPOCH + 2) * EPOCH_PERIOD } : { number: 100, timestamp: now }
    ),
    getTransaction: jest.fn(async () => ({
      hash: sentLog.transactionHash,
      to: txTo,
      // A relay contract's calldata happens to be ABI-identical to sendSnapshot(epoch, currentClaim),
      // while the relay itself calls the inbox with a different struct.
      data: inboxInterface.encodeFunctionData("sendSnapshot", [EPOCH, currentClaim]),
    })),
    getTransactionReceipt: jest.fn(async () => ({
      blockNumber: 50,
      logs: [l2ToL1TxLog(INBOX, EPOCH, txTo === INBOX ? currentClaim : relayedClaim)],
    })),
  };
  const veaOutbox: any = {
    getAddress: async () => "0x00000000000000000000000000000000000b0b00",
    claimHashes: jest.fn(async () => hashClaim(currentClaim as any)),
    filters: { FailedResolution: () => ({ event: "FailedResolution" }) },
    queryFilter: jest.fn(async () => []),
  };
  const veaOutboxProvider: any = {
    getBlock: jest.fn(async () => ({ number: 1000, timestamp: now })),
  };
  return {
    chainId: 11155111,
    network: Network.TESTNET,
    veaInbox,
    veaInboxProvider,
    veaOutbox,
    veaOutboxProvider,
    l1Provider: veaOutboxProvider,
    epoch: EPOCH,
    epochPeriod: EPOCH_PERIOD,
    emitter: new MockEmitter() as any,
    fetchMessageStatus: jest.fn(async () => 0),
    fetchSnapshotSentFromGraph: jest.fn(async () => null),
    cache: createClaimResolveCache(),
  };
};

describe("BR-10 provenance: a SnapshotSent is adopted only from a direct sendSnapshot call to the inbox", () => {
  it("control: a direct call to the inbox carrying the current claim is adopted", async () => {
    const state = await getClaimResolveState(setup(INBOX) as any);
    expect(state.sendSnapshot.status).toBe(true);
  });

  it("does not adopt a SnapshotSent whose transaction was sent to another contract", async () => {
    const state = await getClaimResolveState(setup(RELAY) as any);
    // Adopting it means the validator never sends its own snapshot and waits ~7 days on a
    // ticket whose real payload it never checked.
    expect(state.sendSnapshot.status).toBe(false);
  });
});

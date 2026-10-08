/**
 * BR-10 (a started dispute is driven to resolution) / A4 (whose ticket is trusted).
 *
 * `sendSnapshot` is permissionless and does not validate the claim struct. After the
 * validator's own correct `SnapshotSent` (carrying the current claim), anyone can call
 * `sendSnapshot(epoch, wrongStruct)` for a few cents of Arbitrum gas. That later ticket can
 * only end in `FailedResolution` and never resolves anything, so it must not displace the
 * valid ticket already in flight. If it does, the validator re-sends and restarts its ~7-day
 * wait, and a third party can repeat this indefinitely so the dispute is never resolved.
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
const wrongClaim = { ...currentClaim, challenger: "0x3333333333333333333333333333333333333333" };

const OURS = { transactionHash: "0x" + "01".repeat(32), blockNumber: 50, index: 0 };
const THEIRS = { transactionHash: "0x" + "02".repeat(32), blockNumber: 80, index: 0 };

describe("BR-10: a later third-party ticket with a wrong struct does not displace a valid ticket in flight", () => {
  it("keeps following the valid SnapshotSent", async () => {
    const now = (EPOCH + 5) * EPOCH_PERIOD;
    const veaInbox: any = {
      interface: inboxInterface,
      getAddress: async () => INBOX,
      filters: { SnapshotSent: () => ({ event: "SnapshotSent" }) },
      queryFilter: jest.fn(async (_f: any, lo: number, hi: number) =>
        [OURS, THEIRS].filter((l) => l.blockNumber >= lo && l.blockNumber <= hi)
      ),
    };
    const veaInboxProvider: any = {
      getBlock: jest.fn(async (tag: any) =>
        typeof tag === "number"
          ? { number: tag, timestamp: (EPOCH + 2) * EPOCH_PERIOD + tag }
          : { number: 100, timestamp: now }
      ),
      getTransaction: jest.fn(async (hash: string) => ({
        hash,
        to: INBOX,
        data: inboxInterface.encodeFunctionData("sendSnapshot", [
          EPOCH,
          hash === OURS.transactionHash ? currentClaim : wrongClaim,
        ]),
      })),
      getTransactionReceipt: jest.fn(async (hash: string) => ({
        blockNumber: hash === OURS.transactionHash ? OURS.blockNumber : THEIRS.blockNumber,
        logs: [l2ToL1TxLog(INBOX, EPOCH, hash === OURS.transactionHash ? currentClaim : wrongClaim)],
      })),
    };
    const veaOutbox: any = {
      getAddress: async () => "0x00000000000000000000000000000000000b0b00",
      claimHashes: jest.fn(async () => hashClaim(currentClaim as any)),
      filters: { FailedResolution: () => ({ event: "FailedResolution" }) },
      queryFilter: jest.fn(async () => []),
    };
    const veaOutboxProvider: any = { getBlock: jest.fn(async () => ({ number: 1000, timestamp: now })) };
    const fetchMessageStatus = jest.fn(async () => 0);

    const state = await getClaimResolveState({
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
      fetchMessageStatus: fetchMessageStatus as any,
      fetchSnapshotSentFromGraph: jest.fn(async () => null) as any,
      cache: createClaimResolveCache(),
    });

    // The valid ticket is still the one to wait on and execute; status false would make the
    // validator send another snapshot and restart the L2 -> L1 wait.
    expect(state.sendSnapshot.status).toBe(true);
    expect(state.sendSnapshot.txHash).toBe(OURS.transactionHash);
  });
});

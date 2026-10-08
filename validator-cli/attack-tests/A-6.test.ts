/**
 * BR-9 / BR-11 (who the stored claim names as challenger; recovering a deposit after shutdown).
 *
 * After the bridge shuts down, `withdrawChallengerEscapeHatch` zeroes `challenger` while the
 * claimer is still in the claim. `challenge()` carries no `OnlyBridgeRunning` modifier, so the
 * zeroed claim can be challenged again: the outbox then holds
 * `{claimer: us, challenger: B, honest: None}` and two `Challenged(E, ·)` logs exist (A, then B).
 * BR-9: "Every reachable claim state is reconstructed". Without it our claimer can never call
 * `withdrawClaimerEscapeHatch`, which needs the exact struct (BR-11).
 */
import { ethers } from "ethers";
import { getClaim, hashClaim } from "../src/utils/claim";
import { Network } from "../src/consts/bridgeRoutes";
import { MockEmitter } from "../src/utils/emitter";

const SEC_PER_BLOCK = 12;
const EPOCH_PERIOD = 7200;
const EPOCH = 1; // claim window [14400, 21600) -> blocks 1200..1799

jest.mock("../src/utils/epochHandler", () => {
  const actual = jest.requireActual("../src/utils/epochHandler");
  return { ...actual, blockAtTimestamp: jest.fn(async ({ timestamp }: any) => Math.floor(timestamp / 12)) };
});

const US = "0x1111111111111111111111111111111111111111";
const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const pad = (addr: string) => "0x" + "0".repeat(24) + addr.slice(2).toLowerCase();

const STATE_ROOT = ethers.keccak256(ethers.toUtf8Bytes("honest root"));
const CLAIMED_BLOCK = 1500;

describe("BR-9: a claim re-challenged after a challenger escape-hatch withdrawal is reconstructed", () => {
  const run = async (challengers: string[]) => {
    const stored = {
      stateRoot: STATE_ROOT,
      claimer: US,
      timestampClaimed: CLAIMED_BLOCK * SEC_PER_BLOCK,
      timestampVerification: 0,
      blocknumberVerification: 0,
      honest: 0,
      challenger: B,
    };
    const logs: Record<string, any[]> = {
      Claimed: [{ data: STATE_ROOT, topics: [null, pad(US)], blockNumber: CLAIMED_BLOCK, index: 0 }],
      Challenged: challengers.map((c, i) => ({ topics: [null, null, pad(c)], blockNumber: 3000 + 1000 * i, index: 0 })),
      VerificationStarted: [],
    };
    const veaOutbox: any = {
      getAddress: async () => "0x00000000000000000000000000000000000b0b00",
      claimHashes: jest.fn(async () => hashClaim(stored as any)),
      filters: {
        Claimed: () => ({ event: "Claimed" }),
        Challenged: () => ({ event: "Challenged" }),
        VerificationStarted: () => ({ event: "VerificationStarted" }),
      },
      queryFilter: jest.fn(async (filter: any, lo: number, hi: number) =>
        (logs[filter.event] ?? []).filter((log) => log.blockNumber >= lo && log.blockNumber <= hi)
      ),
    };
    const veaOutboxProvider: any = {
      getBlock: jest.fn(async (tag: any) =>
        typeof tag === "number"
          ? { number: tag, timestamp: tag * SEC_PER_BLOCK }
          : { number: 5000, timestamp: 5000 * SEC_PER_BLOCK }
      ),
      getTransactionReceipt: jest.fn(async () => ({ blockNumber: 0 })),
    };
    // A truthful indexer that knows both challenges.
    const fetchClaimForEpoch = jest.fn(async () => ({
      id: "1",
      bridger: US,
      stateRoot: STATE_ROOT,
      timestamp: CLAIMED_BLOCK * SEC_PER_BLOCK,
      challenged: true,
      txHash: "0x01",
      verification: [],
      challenge: challengers.map((challenger) => ({ challenger })),
    }));

    const claim = await getClaim({
      network: Network.TESTNET,
      chainId: 11155111,
      veaOutbox,
      veaOutboxProvider,
      epoch: EPOCH,
      epochPeriod: EPOCH_PERIOD,
      emitter: new MockEmitter() as any,
      fetchClaimForEpoch: fetchClaimForEpoch as any,
    });

    return { claim, stored };
  };

  it("control: a single challenge by B is reconstructed", async () => {
    const { claim, stored } = await run([B]);
    expect(hashClaim(claim as any)).toBe(hashClaim(stored as any));
  });

  it("returns the struct naming the second challenger, so our claimer escape hatch can be called", async () => {
    // A challenged first, withdrew through the escape hatch (challenger zeroed), then B re-challenged.
    const { claim, stored } = await run([A, B]);
    expect(claim).not.toBeNull();
    expect(hashClaim(claim as any)).toBe(hashClaim(stored as any));
    expect(String(claim!.claimer).toLowerCase()).toBe(US);
  });
});

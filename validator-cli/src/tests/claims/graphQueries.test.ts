import { ethers } from "ethers";
import request from "graphql-request";
import { getClaimsForEpochs } from "../../utils/graphQueries";

jest.mock("graphql-request", () => ({ __esModule: true, default: jest.fn() }));

const STATE_ROOT = "0x" + "ab".repeat(32);

describe("#17: getClaimsForEpochs uses the latest VerificationStarted", () => {
  beforeEach(() => {
    process.env.ENVIO_URL = "http://indexer.invalid/graphql";
    (request as unknown as jest.Mock).mockReset();
  });

  it.each([
    ["oldest first", [1000, 2000]],
    ["newest first", [2000, 1000]],
  ])("takes the restarted verification's start (%s)", async (_label, starts) => {
    (request as unknown as jest.Mock).mockResolvedValue({
      Claim: [
        {
          id: "c",
          epoch: 7,
          bridger: "0x1111111111111111111111111111111111111111",
          stateRoot: STATE_ROOT,
          timestamp: 500,
          txHash: "0xclaim",
          challenged: false,
          verification: starts.map((startTimestamp, i) => ({
            startTimestamp: String(startTimestamp),
            startTxHash: `0x0${i}`,
          })),
          challenge: [],
        },
      ],
    });

    const claims = await getClaimsForEpochs([7], "0xoutbox", 11155111);

    expect(claims.get(7)?.timestampVerification).toBe(2000);
    expect(claims.get(7)?.challenger).toBe(ethers.ZeroAddress);
    // The query asks for the newest verification first, as getClaimForEpoch does.
    expect((request as unknown as jest.Mock).mock.calls[0][1]).toContain(
      "verification(order_by: {startTimestamp: desc})"
    );
  });

  it("reports 0 when no verification started", async () => {
    (request as unknown as jest.Mock).mockResolvedValue({
      Claim: [
        { id: "c", epoch: 7, bridger: "0x1", stateRoot: STATE_ROOT, timestamp: 1, txHash: "0x", challenged: false },
      ],
    });

    expect((await getClaimsForEpochs([7], "0xoutbox", 11155111)).get(7)?.timestampVerification).toBe(0);
  });
});

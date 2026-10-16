import { Interface, JsonRpcProvider, Network } from "ethers";
import { YaruAbi } from "./abi";
import {
  CALL_FAILED_SELECTOR,
  MESSAGE_ID_ALREADY_EXECUTED_SELECTOR,
  PreflightFailure,
  classifyPreflightError,
  isRevertClass,
  isSkippableThresholdError,
} from "./revertClass";
import { FixtureId, ethCallPayload, fixtures, nodeErrors, preflightFixtures } from "../../tests/hashi/revertFixtures";

describe("revertClass", () => {
  // Fixture, revert class, threshold-check skip, preflight class. A1/A2 are VM aborts: transport for the revert
  // rule, skipped only by the threshold check.
  const table: [FixtureId, "transport" | "revert", boolean, PreflightFailure][] = [
    ["T1", "transport", false, PreflightFailure.TRANSPORT],
    ["T2", "transport", false, PreflightFailure.TRANSPORT],
    ["T3", "transport", false, PreflightFailure.TRANSPORT],
    ["T4", "transport", false, PreflightFailure.TRANSPORT],
    ["T5", "transport", false, PreflightFailure.TRANSPORT],
    ["T6", "transport", false, PreflightFailure.TRANSPORT],
    ["R1", "revert", true, PreflightFailure.OTHER_REVERT],
    ["R2", "revert", true, PreflightFailure.OTHER_REVERT],
    ["R3", "revert", true, PreflightFailure.OTHER_REVERT],
    ["R4", "revert", true, PreflightFailure.CALL_FAILED],
    ["R5", "revert", true, PreflightFailure.ALREADY_EXECUTED],
    ["A1", "transport", true, PreflightFailure.TRANSPORT],
    ["A2", "transport", true, PreflightFailure.TRANSPORT],
  ];

  it.each(table)(
    "rule R classifies %s as %s (threshold skip: %s, preflight: %s)",
    (id, ruleClass, thresholdSkip, preflight) => {
      const iface = new Interface(YaruAbi);
      expect(CALL_FAILED_SELECTOR).toBe(iface.getError("CallFailed")!.selector);
      expect(MESSAGE_ID_ALREADY_EXECUTED_SELECTOR).toBe(iface.getError("MessageIdAlreadyExecuted")!.selector);

      const error = fixtures[id];
      expect(isRevertClass(error)).toBe(ruleClass === "revert");
      expect(isSkippableThresholdError(error)).toBe(thresholdSkip);
      expect(classifyPreflightError(error)).toBe(preflight);
      if (id in preflightFixtures) {
        const contractShaped = preflightFixtures[id as keyof typeof preflightFixtures];
        expect(isRevertClass(contractShaped)).toBe(true);
        expect(classifyPreflightError(contractShaped)).toBe(preflight);
      }
    }
  );

  it("never reads e.message or e.shortMessage", () => {
    const error = { ...fixtures.T1, message: "execution reverted", shortMessage: "missing revert data" };
    expect(isRevertClass(error)).toBe(false);
    expect(isSkippableThresholdError(error)).toBe(false);
  });

  it("the CALL_EXCEPTION fixtures match what ethers builds from the node response", () => {
    const provider = new JsonRpcProvider("http://127.0.0.1:1", Network.from(1), { staticNetwork: true });
    try {
      for (const [id, nodeError] of Object.entries(nodeErrors)) {
        const built: any = provider.getRpcError(ethCallPayload as any, { id: 1, error: nodeError } as any);
        const fixture: any = fixtures[id as FixtureId];
        expect({ id, code: built.code, data: built.data, node: built.info?.error?.message }).toEqual({
          id,
          code: fixture.code,
          data: fixture.data,
          node: fixture.info.error.message,
        });
        expect(built.shortMessage).toBe(fixture.shortMessage);
        expect(built.reason).toBe(fixture.reason);
      }
    } finally {
      provider.destroy();
    }
  });
});

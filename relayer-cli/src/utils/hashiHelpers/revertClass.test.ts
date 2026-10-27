import { Interface } from "ethers";
import { YaruAbi } from "./abi";
import {
  CALL_FAILED_SELECTOR,
  MESSAGE_ID_ALREADY_EXECUTED_SELECTOR,
  PreflightFailure,
  classifyPreflightError,
} from "./revertClass";
import {
  ALREADY_EXECUTED_DATA,
  FIXTURE_IDS,
  FixtureId,
  fixtures,
  fromNodeError,
  nodeBodies,
  yaruStaticCall,
} from "../../tests/revert/fixtures";

const { TRANSPORT, ALREADY_EXECUTED, CALL_FAILED, OTHER_REVERT } = PreflightFailure;

// The preflight class of every fixture: transport and unknown failures are TRANSPORT (kept pending, no probe), and a
// revert or a VM abort is told apart by its Yaru selector.
const transportIds = [
  ...["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "P12", "P13", "P14"],
  ...["U1", "U2", "U3", "U4", "P11"],
];
const selectorClass: Partial<Record<FixtureId, PreflightFailure>> = {
  R4: CALL_FAILED,
  N4: CALL_FAILED,
  R5: ALREADY_EXECUTED,
};
const table: [FixtureId, PreflightFailure][] = FIXTURE_IDS.map((id) => [
  id,
  transportIds.includes(id) ? TRANSPORT : selectorClass[id] ?? OTHER_REVERT,
]);

describe("revertClass", () => {
  it("keeps the Yaru selectors of CallFailed and MessageIdAlreadyExecuted", () => {
    const iface = new Interface(YaruAbi);
    expect(CALL_FAILED_SELECTOR).toBe(iface.getError("CallFailed")!.selector);
    expect(MESSAGE_ID_ALREADY_EXECUTED_SELECTOR).toBe(iface.getError("MessageIdAlreadyExecuted")!.selector);
  });

  it.each(table)(
    "classifies a preflight failing with %s as %s, raw and through the Yaru staticCall",
    (id, preflight) => {
      expect(classifyPreflightError(fixtures[id])).toBe(preflight);
      expect(classifyPreflightError(yaruStaticCall(id))).toBe(preflight);
    }
  );

  it("reads the AlreadyExecuted selector from info.error.data when e.data is null", () => {
    const error = fromNodeError({ ...nodeBodies.N4, data: ALREADY_EXECUTED_DATA });
    expect((error as any).data).toBeNull();
    expect(classifyPreflightError(error)).toBe(ALREADY_EXECUTED);
  });

  it("never reads e.message or e.shortMessage", () => {
    const error = { ...fixtures.T1, message: "execution reverted", shortMessage: "missing revert data" };
    expect(classifyPreflightError(error)).toBe(TRANSPORT);
  });
});

import { messageExecutor } from "./arbMsgExecutor";

const mockExecute = jest.fn();
let mockMessages: { execute: jest.Mock }[] = [];
jest.mock("@arbitrum/sdk", () => ({
  ArbitrumProvider: jest.fn().mockImplementation(() => ({
    getTransactionReceipt: jest.fn().mockResolvedValue({ transactionHash: "0xsent" }),
  })),
  ChildTransactionReceipt: jest.fn().mockImplementation(() => ({
    getChildToParentMessages: jest.fn(async () => mockMessages),
  })),
}));
jest.mock("@ethersproject/wallet", () => ({ Wallet: jest.fn() }));

describe("messageExecutor", () => {
  beforeEach(() => {
    mockExecute.mockReset().mockResolvedValue({ hash: "0xexec" });
    mockMessages = [{ execute: mockExecute }];
  });

  it("executes the receipt's first child-to-parent message, priced by the Arbitrum SDK itself", async () => {
    // A stuck execution is re-broadcast as it was signed, never executed again at other fees.
    await expect(messageExecutor("0xsent", {} as any, {} as any)).resolves.toEqual({ hash: "0xexec" });
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute.mock.calls[0]).toHaveLength(1);
  });

  it("throws when the receipt carries no child-to-parent message", async () => {
    mockMessages = [];
    await expect(messageExecutor("0xsent", {} as any, {} as any)).rejects.toThrow("No child-to-parent messages found");
  });
});

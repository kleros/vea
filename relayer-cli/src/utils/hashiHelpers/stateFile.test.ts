import { readPendingMessages } from "./stateFile";
import { fakeFileSystem } from "../../tests/hashi/dispatchedLogs";

describe("stateFile", () => {
  const FAKE_STATE_DIR = "/fake-hashi-state/";
  let savedStateDir: string | undefined;

  beforeEach(() => {
    savedStateDir = process.env.STATE_DIR;
    process.env.STATE_DIR = FAKE_STATE_DIR;
  });

  afterEach(() => {
    if (savedStateDir === undefined) {
      delete process.env.STATE_DIR;
    } else {
      process.env.STATE_DIR = savedStateDir;
    }
  });

  describe("readPendingMessages", () => {
    it("reads a message saved as a positional array (a serialized ethers Result) back as the named object", async () => {
      const reporter = "0x0000000000000000000000000000000000001000";
      const adapter = "0x0000000000000000000000000000000000002000";
      const positional = {
        txHash: "0xabc",
        blockNumber: 77,
        messageId: "123n",
        timestamp: 1_700_000_000,
        message: ["3n", "1n", "1n", "0xSender", "0xReceiver", "0x1234", [reporter], [adapter]],
      };
      const named = {
        txHash: "0xdef",
        blockNumber: 78,
        messageId: "124n",
        timestamp: 1_700_000_001,
        message: {
          nonce: 4,
          targetChainId: 1,
          threshold: 1,
          sender: "0xSender",
          receiver: "0xReceiver",
          data: "0x",
          reporters: [reporter],
          adapters: [adapter],
        },
      };
      const stateFile = JSON.stringify({ ts: 1, hashiBlockNumber: 80, hashiMessages: [positional, named] });
      const { fileSystem } = fakeFileSystem({ [`${FAKE_STATE_DIR}hashi_0_1.json`]: stateFile });

      const messages = await readPendingMessages(0, 1, "hashi", fileSystem);

      expect(messages).toEqual([
        {
          txHash: "0xabc",
          blockNumber: 77,
          messageId: 123n,
          timestamp: 1_700_000_000,
          message: {
            nonce: 3n,
            targetChainId: 1n,
            threshold: 1n,
            sender: "0xSender",
            receiver: "0xReceiver",
            data: "0x1234",
            reporters: [reporter],
            adapters: [adapter],
          },
        },
        { ...named, messageId: 124n },
      ]);
      expect(Array.isArray(messages[0].message)).toBe(false);
    });
  });
});

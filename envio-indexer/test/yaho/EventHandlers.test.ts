import { createTestIndexer, TestHelpers } from "envio";
import "../../src/handlers/yaho";

const { mockAddresses } = TestHelpers.Addresses;

const YAHO_ADDRESS = mockAddresses[0];
const SENDER = mockAddresses[1];
const RECEIVER = mockAddresses[2];
const REPORTER = mockAddresses[3];
const ADAPTER = mockAddresses[4];

const BASE_MESSAGE = {
  nonce: 1n,
  targetChainId: 42161n,
  threshold: 1n,
  sender: SENDER,
  receiver: RECEIVER,
  data: "0xdeadbeef",
  reporters: [REPORTER],
  adapters: [ADAPTER],
};

describe("Yaho MessageDispatched handler", () => {
  it("stores a MessageDispatched entity with correct fields", async () => {
    const testIndexer = createTestIndexer();

    const { changes } = await testIndexer.process({
      chains: {
        42161: {
          simulate: [
            {
              contract: "Yaho",
              event: "MessageDispatched",
              srcAddress: YAHO_ADDRESS,
              block: { number: 100, timestamp: 1700000000 },
              logIndex: 0,
              params: { messageId: 1n, message: BASE_MESSAGE },
            },
          ],
        },
      },
    });

    const entity = await testIndexer.MessageDispatched.get("42161_100_0");

    expect(entity).toBeDefined();
    if (!entity) throw new Error("Entity not found");

    expect(entity.messageId).toBe("1");
    expect(entity.sourceChainId).toBe(42161n);
    expect(entity.yaho).toBe(YAHO_ADDRESS);
    expect(entity.nonce).toBe(1n);
    expect(entity.targetChainId).toBe(42161n);
    expect(entity.threshold).toBe(1n);
    expect(entity.sender).toBe(SENDER);
    expect(entity.receiver).toBe(RECEIVER);
    expect(entity.data).toBe("0xdeadbeef");
    expect(entity.reporters).toBe(JSON.stringify([REPORTER]));
    expect(entity.adapters).toBe(JSON.stringify([ADAPTER]));
    expect(entity.blockNumber).toBe(100n);
    expect(entity.blockTimestamp).toBe(1700000000n);

    expect(changes).toHaveLength(1);
    expect(changes[0].MessageDispatched?.sets).toHaveLength(1);
  });

  it("generates a unique ID from chainId, blockNumber, and logIndex", async () => {
    const testIndexer = createTestIndexer();

    await testIndexer.process({
      chains: {
        421614: {
          simulate: [
            {
              contract: "Yaho",
              event: "MessageDispatched",
              srcAddress: YAHO_ADDRESS,
              block: { number: 50, timestamp: 1700000001 },
              logIndex: 3,
              params: { messageId: 2n, message: BASE_MESSAGE },
            },
          ],
        },
      },
    });

    const entity = await testIndexer.MessageDispatched.get("421614_50_3");
    expect(entity).toBeDefined();
    if (!entity) throw new Error("Entity not found");
    expect(entity.messageId).toBe("2");
  });

  it("indexes multiple events in the same block with distinct IDs", async () => {
    const testIndexer = createTestIndexer();

    await testIndexer.process({
      chains: {
        42161: {
          simulate: [
            {
              contract: "Yaho",
              event: "MessageDispatched",
              srcAddress: YAHO_ADDRESS,
              block: { number: 200, timestamp: 1700000002 },
              logIndex: 0,
              params: { messageId: 10n, message: BASE_MESSAGE },
            },
            {
              contract: "Yaho",
              event: "MessageDispatched",
              srcAddress: YAHO_ADDRESS,
              block: { number: 200, timestamp: 1700000002 },
              logIndex: 1,
              params: { messageId: 11n, message: { ...BASE_MESSAGE, nonce: 2n } },
            },
          ],
        },
      },
    });

    const first = await testIndexer.MessageDispatched.get("42161_200_0");
    const second = await testIndexer.MessageDispatched.get("42161_200_1");

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) throw new Error("Entities not found");

    expect(first.messageId).toBe("10");
    expect(second.messageId).toBe("11");
    expect(second.nonce).toBe(2n);
  });

  it("serializes reporters and adapters as JSON strings", async () => {
    const testIndexer = createTestIndexer();
    const multiReporters = [mockAddresses[3], mockAddresses[5]];
    const multiAdapters = [mockAddresses[4], mockAddresses[6]];

    await testIndexer.process({
      chains: {
        42161: {
          simulate: [
            {
              contract: "Yaho",
              event: "MessageDispatched",
              srcAddress: YAHO_ADDRESS,
              block: { number: 300, timestamp: 1700000003 },
              logIndex: 0,
              params: {
                messageId: 20n,
                message: {
                  ...BASE_MESSAGE,
                  reporters: multiReporters,
                  adapters: multiAdapters,
                },
              },
            },
          ],
        },
      },
    });

    const entity = await testIndexer.MessageDispatched.get("42161_300_0");
    expect(entity).toBeDefined();
    if (!entity) throw new Error("Entity not found");
    expect(entity.reporters).toBe(JSON.stringify(multiReporters));
    expect(entity.adapters).toBe(JSON.stringify(multiAdapters));
  });
});

import * as fs from "fs";
import { AbiCoder, Interface, Provider, getAddress, toBeHex, zeroPadValue } from "ethers";
import { messageDispatchedAbi } from "../../utils/hashiHelpers/abi";

const dispatchedEvent = new Interface(messageDispatchedAbi).getEvent("MessageDispatched");

const YAHO = getAddress("0x00000000000000000000000000000000000000a1");

const address = (n: number) => getAddress(zeroPadValue(toBeHex(n), 20));

/**
 * A Yaho message struct with distinct, checksummed reporter and adapter addresses.
 */
function dispatchedMessage(nonce: bigint, targetChainId: bigint, bridges: number) {
  return {
    nonce,
    targetChainId,
    threshold: BigInt(bridges),
    sender: address(0x5e),
    receiver: address(0x4ec),
    data: "0x12345678",
    reporters: Array.from({ length: bridges }, (_, i) => address(0x1000 + i)),
    adapters: Array.from({ length: bridges }, (_, i) => address(0x2000 + i)),
  };
}

/**
 * A MessageDispatched log encoded as Yaho emits it: messageId as the indexed topic, the struct as data.
 */
function dispatchedLog(messageId: bigint, message: ReturnType<typeof dispatchedMessage>, blockNumber: number) {
  return {
    address: YAHO,
    blockNumber,
    transactionHash: zeroPadValue(toBeHex(blockNumber), 32),
    topics: [dispatchedEvent.topicHash, zeroPadValue(toBeHex(messageId), 32)],
    data: AbiCoder.defaultAbiCoder().encode([dispatchedEvent.inputs[1]], [message]),
  };
}

/**
 * A source chain provider for the log scan: a finalized head, block timestamps, and logs per range.
 */
function logScanProvider(finalizedHead: number, logs: ReturnType<typeof dispatchedLog>[], blockTimestamp: number) {
  const provider = {
    getBlock: jest.fn(async (tag: string | number) =>
      tag === "finalized" ? { number: finalizedHead } : { number: tag, timestamp: blockTimestamp }
    ),
    getLogs: jest.fn(async (filter: { fromBlock: number; toBlock: number }) =>
      logs.filter((log) => log.blockNumber >= filter.fromBlock && log.blockNumber <= filter.toBlock)
    ),
  };
  return provider as typeof provider & Pick<Provider, "getBlock" | "getLogs">;
}

/**
 * An in-memory file system for the state file helpers; nothing touches the disk.
 */
function fakeFileSystem(files: Record<string, string> = {}) {
  const store = new Map(Object.entries(files));
  const fileSystem = {
    existsSync: jest.fn((path: string) => store.has(path)),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn((path: string, data: string) => {
      store.set(path, data);
    }),
    readFileSync: jest.fn((path: string) => {
      if (!store.has(path)) throw new Error(`ENOENT: ${path}`);
      return store.get(path);
    }),
  };
  return { fileSystem: fileSystem as unknown as typeof fs, store };
}

export { YAHO, dispatchedMessage, dispatchedLog, logScanProvider, fakeFileSystem };

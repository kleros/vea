import { createPublicClient, http, type Address, type Hash, type Hex } from "viem";
import { YahoAbi } from "@kleros/veashi-sdk";
import type { HashiMessage } from "./types";
import { getViemChain } from "./chains";

/**
 * Decoded shape of a `MessageDispatched` event log. `YahoAbi` is a JSON import,
 * so viem can't infer `args` from it (the ABI isn't a readonly `as const`
 * tuple); we type the fields we read explicitly instead of falling back to `any`.
 */
type MessageDispatchedLog = {
  args: {
    messageId: bigint;
    message: {
      nonce: bigint;
      targetChainId: bigint;
      threshold: bigint;
      sender: Address;
      receiver: Address;
      data: Hex;
      reporters: readonly Address[];
      adapters: readonly Address[];
    };
  };
  transactionHash: Hash;
  blockNumber: bigint;
};

export interface HashiMessageExecutionVars {
  txHash: string;
  blockNumber: number;
  messageId: string;
  message: HashiMessage;
}

export async function getMessageDispatchedLogs(
  yahoAddress: Address,
  fromBlock: bigint,
  toBlock: bigint,
  chainId: number
): Promise<HashiMessageExecutionVars[]> {
  const chain = getViemChain(chainId);
  const publicClient = createPublicClient({
    transport: http(),
    chain,
  });

  const allLogs: HashiMessageExecutionVars[] = [];
  const logs = await publicClient.getContractEvents({
    address: yahoAddress,
    abi: YahoAbi,
    eventName: "MessageDispatched",
    fromBlock: fromBlock,
    toBlock: toBlock,
  });
  for (const log of logs) {
    const { args, transactionHash, blockNumber } = log as unknown as MessageDispatchedLog;

    if (!args || !args.message) continue;

    const { messageId, message } = args;

    const formattedMessage: HashiMessage = {
      nonce: Number(message.nonce),
      targetChainId: Number(message.targetChainId),
      threshold: Number(message.threshold),
      sender: message.sender,
      receiver: message.receiver,
      data: message.data,
      reporters: [...message.reporters],
      adapters: [...message.adapters],
    };

    allLogs.push({
      txHash: transactionHash,
      blockNumber: Number(blockNumber),
      messageId: messageId.toString(),
      message: formattedMessage,
    });
  }

  allLogs.sort((a, b) => a.blockNumber - b.blockNumber);
  return allLogs;
}

export async function getMessageFromTxHash(
  yahoAddress: Address,
  chainId: number,
  txHash: Hash
): Promise<HashiMessageExecutionVars | null> {
  const chain = getViemChain(chainId);
  const publicClient = createPublicClient({
    transport: http(),
    chain,
  });
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

  const targetLog = receipt.logs.find((l) => l.address.toLowerCase() === yahoAddress.toLowerCase());

  if (!targetLog) return null;

  const decodedLogs = await publicClient.getContractEvents({
    address: yahoAddress,
    abi: YahoAbi,
    eventName: "MessageDispatched",
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber,
  });

  const log = decodedLogs.find((l) => l.transactionHash === txHash);

  if (!log) return null;

  const { args, blockNumber } = log as unknown as MessageDispatchedLog;
  const { messageId, message } = args;

  const formattedMessage: HashiMessage = {
    nonce: Number(message.nonce),
    targetChainId: Number(message.targetChainId),
    threshold: Number(message.threshold),
    sender: message.sender,
    receiver: message.receiver,
    data: message.data,
    reporters: [...message.reporters],
    adapters: [...message.adapters],
  };

  return {
    txHash: txHash,
    blockNumber: Number(blockNumber),
    messageId: messageId.toString(),
    message: formattedMessage,
  };
}

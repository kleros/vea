import { indexer } from "envio";

indexer.onEvent({ contract: "Yaho", event: "MessageDispatched" }, async ({ event, context }) => {
  const { messageId, message } = event.params;

  context.MessageDispatched.set({
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    messageId: messageId.toString(),
    txHash: event.transaction.hash,
    sourceChainId: BigInt(event.chainId),
    yaho: event.srcAddress,
    nonce: message.nonce,
    targetChainId: message.targetChainId,
    threshold: message.threshold,
    sender: message.sender,
    receiver: message.receiver,
    data: message.data,
    reporters: JSON.stringify(message.reporters),
    adapters: JSON.stringify(message.adapters),
    blockNumber: BigInt(event.block.number),
    blockTimestamp: BigInt(event.block.timestamp),
  });
});

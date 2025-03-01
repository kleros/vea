import {
  ChildTransactionReceipt,
  ArbitrumProvider,
  ChildToParentMessageWriter,
  ChildToParentMessageStatus,
} from "@arbitrum/sdk";
import { Wallet } from "@ethersproject/wallet";
import { JsonRpcProvider, TransactionReceipt } from "@ethersproject/providers";
import { Signer } from "@ethersproject/abstract-signer";
import { ContractTransaction } from "@ethersproject/contracts";

/**
 * Execute the child-to-parent (arbitrum-to-ethereum) message,
 * for reference see: https://docs.arbitrum.io/sdk/reference/message/ChildToParentMessage
 *
 * @param trnxHash Hash of the transaction
 * @param childJsonRpc L2 provider
 * @param parentJsonRpc L1 provider
 * @returns Execution transaction for the message
 *
 * */
async function messageExecutor(
  trnxHash: string,
  childJsonRpc: JsonRpcProvider,
  parentProvider: JsonRpcProvider
): Promise<ContractTransaction> {
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const childProvider = new ArbitrumProvider(childJsonRpc);

  const childReceipt: TransactionReceipt = await childProvider.getTransactionReceipt(trnxHash);
  if (!childReceipt) {
    throw new Error(`Transaction receipt not found for hash: ${trnxHash}`);
  }

  const messageReceipt = new ChildTransactionReceipt(childReceipt);
  const parentSigner: Signer = new Wallet(PRIVATE_KEY, parentProvider);

  const messages = await messageReceipt.getChildToParentMessages(parentSigner);
  const childToParentMessage: ChildToParentMessageWriter = messages[0];
  if (!childToParentMessage) {
    throw new Error("No child-to-parent messages found");
  }

  // Execute the message
  const res = await childToParentMessage.execute(childProvider);
  return res;
}

/**
 *
 * @param trnxHash Hash of the transaction
 * @param childJsonRpc L2 provider
 * @param parentJsonRpc L1 provider
 * @returns status of the message: 0 - not ready, 1 - ready
 *
 */
async function getMessageStatus(
  trnxHash: string,
  childJsonRpc: JsonRpcProvider,
  parentJsonRpc: JsonRpcProvider
): Promise<ChildToParentMessageStatus> {
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const childProvider = new ArbitrumProvider(childJsonRpc);

  let childReceipt: TransactionReceipt | null;

  childReceipt = await childProvider.getTransactionReceipt(trnxHash);
  if (!childReceipt) {
    throw new Error(`Transaction receipt not found for hash: ${trnxHash}`);
  }
  const messageReceipt = new ChildTransactionReceipt(childReceipt);
  const parentSigner: Signer = new Wallet(PRIVATE_KEY, parentJsonRpc);
  const messages = await messageReceipt.getChildToParentMessages(parentSigner);
  const childToParentMessage = messages[0];
  if (!childToParentMessage) {
    console.error("No child-to-parent messages found");
  }
  const status = await childToParentMessage.status(childProvider);
  return status;
}

export { messageExecutor, getMessageStatus };

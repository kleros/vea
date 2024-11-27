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

// Execute the child-to-parent (arbitrum-to-ethereum) message, for reference see: https://docs.arbitrum.io/sdk/reference/message/ChildToParentMessage
async function messageExecutor(trnxHash: string, childRpc: string, parentRpc: string): Promise<ContractTransaction> {
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const childJsonRpc = new JsonRpcProvider(childRpc);
  const childProvider = new ArbitrumProvider(childJsonRpc);
  const parentProvider = new JsonRpcProvider(parentRpc);

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

async function getMessageStatus(
  trnxHash: string,
  childRpc: string,
  parentRpc: string
): Promise<ChildToParentMessageStatus> {
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const childJsonRpc = new JsonRpcProvider(childRpc);
  const childProvider = new ArbitrumProvider(childJsonRpc);
  const parentProvider = new JsonRpcProvider(parentRpc);

  let childReceipt: TransactionReceipt | null;

  childReceipt = await childProvider.getTransactionReceipt(trnxHash);
  if (!childReceipt) {
    throw new Error(`Transaction receipt not found for hash: ${trnxHash}`);
  }
  const messageReceipt = new ChildTransactionReceipt(childReceipt);
  const parentSigner: Signer = new Wallet(PRIVATE_KEY, parentProvider);
  const messages = await messageReceipt.getChildToParentMessages(parentSigner);
  const childToParentMessage = messages[0];
  if (!childToParentMessage) {
    console.error("No child-to-parent messages found");
  }
  const status = await childToParentMessage.status(childProvider);
  return status;
}

export { messageExecutor, getMessageStatus };

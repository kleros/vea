import { ChildTransactionReceipt, ArbitrumProvider, ChildToParentMessageWriter } from "@arbitrum/sdk";
import { Wallet } from "@ethersproject/wallet";
import { JsonRpcProvider, TransactionReceipt } from "@ethersproject/providers";
import { Signer } from "@ethersproject/abstract-signer";
import { ContractTransaction } from "@ethersproject/contracts";

// Execute the child-to-parent (arbitrum-to-ethereum) message, for reference see: https://docs.arbitrum.io/sdk/reference/message/ChildToParentMessage
export default async function messageExecutor(
  trnxHash: string,
  childRpc: string,
  parentRpc: string
): Promise<ContractTransaction> {
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const childJsonRpc = new JsonRpcProvider(childRpc);
  const childProvider = new ArbitrumProvider(childJsonRpc);
  const parentProvider = new JsonRpcProvider(parentRpc);

  let childReceipt: TransactionReceipt | null;
  try {
    childReceipt = await childProvider.getTransactionReceipt(trnxHash);
  } catch (error) {
    throw new Error(`Failed to get child transaction receipt: ${error.message}`);
  }
  if (!childReceipt) {
    throw new Error(`Transaction receipt not found for hash: ${trnxHash}`);
  }

  const messageReceipt = new ChildTransactionReceipt(childReceipt);
  const parentSigner: Signer = new Wallet(PRIVATE_KEY, parentProvider);

  let childToParentMessage: ChildToParentMessageWriter;
  try {
    const messages = await messageReceipt.getChildToParentMessages(parentSigner);
    childToParentMessage = messages[0];
    if (!childToParentMessage) {
      throw new Error("No child-to-parent messages found");
    }
  } catch (error) {
    throw new Error(`Failed to retrieve child-to-parent messages: ${error.message}`);
  }

  // Execute the message
  try {
    const res = await childToParentMessage.execute(childProvider);
    return res;
  } catch (error) {
    throw new Error(`Message execution failed: ${error.message}`);
  }
}

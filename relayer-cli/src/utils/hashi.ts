import { JsonRpcProvider, Interface, getAddress, zeroPadBytes, Contract, Wallet } from "ethers";
import { getVeaMsgTrnx } from "./graphQueries";
import { getVeaInbox } from "./ethers";
import { getBridgeConfig } from "../consts/bridgeRoutes";
import { executeMessagesAbi, messageDispatchedAbi, thresholdViewAbi } from "./hashiHelpers";

const SOURCE_CHAIN_ID = 421613; // Arbitrum Sepolia

interface HashiMessage {
  hashiContextNonce: number;
  sender: string;
  destinationChainId: number;
  receiver: string;
  threshold: number;
  data: string;
  reporters: string[];
  adapters: string[];
}

type VeaNonceToHashiMessage = {
  nonce: number;
  hashiMessage: HashiMessage;
};

async function runHashiExecutor(chainId: number, network: string, nonce: number) {
  const bridgeConfig = getBridgeConfig(chainId);
  const { veaContracts, rpcInbox } = bridgeConfig;
  const veaInboxAddress = veaContracts[network].veaInbox.address;
  const privateKey = process.env.PRIVATE_KEY;
  const veaInbox = getVeaInbox(veaInboxAddress, privateKey, rpcInbox, chainId);
  const inboxCount = await veaInbox.count();
  const executableNonces: VeaNonceToHashiMessage[] = [];
  while (nonce < inboxCount) {
    // ToDo: Add cooldown periods for nonces that cannot be executed.
    const toExecute = await toExecuteMesssage(chainId, nonce, veaInboxAddress, rpcInbox);
    if (toExecute) {
      executableNonces.push(toExecute);
    }
    nonce++;
  }
  console.log(`Found ${executableNonces.length} executable nonces on Hashi`);
  nonce = await executeBatchOnHashi(chainId, executableNonces);
  console.log(`Processed up to nonce ${nonce} on Hashi`);
  return nonce;
}

async function executeBatchOnHashi(chainId: number, params: VeaNonceToHashiMessage[]): Promise<number> {
  const { yaruAddress, rpcOutbox } = getBridgeConfig(chainId);
  const maxPerTx = 20;
  const provider = new JsonRpcProvider(rpcOutbox);
  const signer = new Wallet(process.env.PRIVATE_KEY!, provider);
  const yaru = new Contract(yaruAddress, executeMessagesAbi, signer);
  const iface = new Interface(executeMessagesAbi);

  let cursor = 0;
  let lastNonceProcessed = 0;

  while (cursor < params.length) {
    const chunk = params.slice(cursor, cursor + maxPerTx);

    const tx = await yaru.executeMessages(chunk);
    const receipt = await tx.wait();

    cursor += chunk.length;
    lastNonceProcessed = Number(params[Math.min(cursor, params.length) - 1].nonce);

    console.log(`Executed ${chunk.length} messages in tx ${receipt.transactionHash}`);
  }

  return ++lastNonceProcessed;
}

async function toExecuteMesssage(
  chainId: number,
  nonce: number,
  inboxAddress: string,
  rpcInbox: string
): Promise<VeaNonceToHashiMessage | null> {
  const hashes = await getVeaMsgTrnx(nonce, inboxAddress);
  const provider = new JsonRpcProvider(rpcInbox);
  const bridgeConfig = getBridgeConfig(chainId);
  const yahoAddress = bridgeConfig.yahoAddress?.toLowerCase();
  const receipt = await provider.getTransactionReceipt(hashes[0]);
  let executeNonce: VeaNonceToHashiMessage | null = null;
  let hashiMessage: HashiMessage | null = null;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === yahoAddress) {
      const logIFace = new Interface(messageDispatchedAbi);
      const logData = log.data;
      const decodedLog = logIFace.decodeEventLog("MessageDispatched", logData, log.topics);
      const message = decodedLog.message;
      hashiMessage = {
        hashiContextNonce: message[0],
        destinationChainId: message[1],
        threshold: message[2],
        sender: message[3],
        receiver: message[4],
        data: message[5],
        reporters: message[6],
        adapters: message[7],
      };
      const thresholdMet = await isThresholdMet(hashiMessage);
      if (thresholdMet) {
        executeNonce = { nonce, hashiMessage };
      }
      break;
    }
  }
  return executeNonce;
}

async function isThresholdMet(message: HashiMessage): Promise<boolean> {
  const bridgeConfig = getBridgeConfig(message.destinationChainId);
  const hashiAddress = bridgeConfig.hashiAddress;
  const provider = new JsonRpcProvider(bridgeConfig.rpcOutbox);
  const domain = BigInt(SOURCE_CHAIN_ID); // uint256
  const id = BigInt(message.hashiContextNonce); // or messageId if contract expects that
  const threshold = BigInt(message.threshold); // uint256
  const adapters = message.adapters.map((address) => getAddress(address)); // address[]
  const iface = new Interface(thresholdViewAbi);
  const data = iface.encodeFunctionData("checkHashWithThresholdFromAdapters", [domain, id, threshold, adapters]);
  const ret = await provider.call({ to: hashiAddress, data });
  const [ok] = iface.decodeFunctionResult("checkHashWithThresholdFromAdapters", ret);
  return ok;
}

export { executeBatchOnHashi, runHashiExecutor, toExecuteMesssage };

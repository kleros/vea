import { getProofAtCount } from "./proof";
import {
  getInboxCount,
  supportedChainIdsOutbox,
  getInboxMsgData,
  getInboxNonceFromSender,
  rpcUrlOutbox,
  veaOutboxFromArbGoerliTo,
} from "./subgraph";
import { getVeaOutboxArbToEth } from "./ethers";
import { Supported } from "../../types";

export const relay = async (chainIdOutbox: Supported<typeof supportedChainIdsOutbox>, nonce: number) => {
  const veaOutbox = getVeaOutboxArbToEth(
    veaOutboxFromArbGoerliTo[chainIdOutbox],
    process.env.PRIVATE_KEY,
    rpcUrlOutbox[chainIdOutbox]
  );
  const stateRoot = await veaOutbox.stateRoot();
  const count = await getInboxCount(chainIdOutbox, { stateRoot });
  const proof = await getProofAtCount(chainIdOutbox, nonce, count.snapshotSaveds[0].count);
  const msgData = await getInboxMsgData(chainIdOutbox, { nonce: [nonce] });
  const txn = await veaOutbox.sendMessage(proof, nonce, msgData.messageSents[0].to.id, msgData.messageSents[0].data);
  await txn.wait();
};

export const relayAllFor = async (
  chainIdOutbox: Supported<typeof supportedChainIdsOutbox>,
  nonce: number,
  sender: string
) => {
  const nonces = await getInboxNonceFromSender(chainIdOutbox, { nonce, msgSender: sender });
  for (const n of nonces.messageSents) {
    await relay(chainIdOutbox, n.nonce);
  }
};

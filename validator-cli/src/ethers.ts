import { Wallet } from "@ethersproject/wallet";
import { JsonRpcProvider } from "@ethersproject/providers";
import { VeaOutbox__factory, VeaInbox__factory } from "@kleros/vea-contracts/typechain-types";

function getWallet(privateKey: string, web3ProviderURL: string) {
  return new Wallet(privateKey, new JsonRpcProvider(web3ProviderURL));
}

function getVeaInbox(veaInboxAddress: string, privateKey: string, web3ProviderURL: string) {
  return VeaInbox__factory.connect(veaInboxAddress, getWallet(privateKey, web3ProviderURL));
}

function getVeaOutbox(veaOutboxAddress: string, privateKey: string, web3ProviderURL: string) {
  return VeaOutbox__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
}

export { getVeaOutbox, getVeaInbox };

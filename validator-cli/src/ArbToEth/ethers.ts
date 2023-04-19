import { Wallet } from "@ethersproject/wallet";
import { JsonRpcProvider } from "@ethersproject/providers";
import { VeaOutboxArbToEth__factory, VeaInboxArbToEth__factory } from "@kleros/vea-contracts/typechain-types";

let provider: JsonRpcProvider;

function getWallet(privateKey: string, web3ProviderURL: string) {
  if (!provider) provider = new JsonRpcProvider(web3ProviderURL);
  return new Wallet(privateKey, provider);
}

function getEvents(address: string, from_block: number, to_block: number | string, filter: any) {
  return provider.getLogs({
    fromBlock: from_block,
    toBlock: to_block,
    address: address,
    topics: filter,
  });
}

function getVeaInboxArbToEth(veaInboxAddress: string, privateKey: string, web3ProviderURL: string) {
  return VeaInboxArbToEth__factory.connect(veaInboxAddress, getWallet(privateKey, web3ProviderURL));
}

function getVeaOutboxArbToEth(veaOutboxAddress: string, privateKey: string, web3ProviderURL: string) {
  return VeaOutboxArbToEth__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
}

export { getVeaOutboxArbToEth, getVeaInboxArbToEth, getEvents };

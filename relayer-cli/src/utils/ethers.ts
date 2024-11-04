import { Wallet } from "@ethersproject/wallet";
import { JsonRpcProvider } from "@ethersproject/providers";
import {
  VeaOutboxArbToEth__factory,
  VeaOutboxArbToEthDevnet__factory,
  VeaInboxArbToEth__factory,
  VeaInboxArbToGnosis__factory,
  VeaOutboxArbToGnosis__factory,
} from "@kleros/vea-contracts/typechain-types";

function getWallet(privateKey: string, web3ProviderURL: string) {
  return new Wallet(privateKey, new JsonRpcProvider(web3ProviderURL));
}

function getWalletRPC(privateKey: string, rpc: JsonRpcProvider) {
  return new Wallet(privateKey, rpc);
}

// Using destination chainId as identifier, Ex: Arbitrum One (42161) -> Ethereum Mainnet (1): Use "1" as chainId
function getVeaInbox(veaInboxAddress: string, privateKey: string, web3ProviderURL: string, chainId: number) {
  if (chainId == 11155111) {
    return VeaInboxArbToEth__factory.connect(veaInboxAddress, getWallet(privateKey, web3ProviderURL));
  } else if (chainId == 10200) {
    return VeaInboxArbToGnosis__factory.connect(veaInboxAddress, getWallet(privateKey, web3ProviderURL));
  } else {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }
}

function getVeaInboxProvider(veaInboxAddress: string, privateKey: string, rpc: JsonRpcProvider, chainId: number) {
  if (chainId == 11155111) {
    return VeaInboxArbToEth__factory.connect(veaInboxAddress, getWalletRPC(privateKey, rpc));
  } else if (chainId == 10200) {
    return VeaInboxArbToGnosis__factory.connect(veaInboxAddress, getWalletRPC(privateKey, rpc));
  }
}

function getVeaOutbox(veaInboxAddress: string, privateKey: string, web3ProviderURL: string, chainId: number) {
  if (chainId == 11155111) {
    return VeaOutboxArbToEth__factory.connect(veaInboxAddress, getWallet(privateKey, web3ProviderURL));
  } else if (chainId == 10200) {
    return VeaOutboxArbToGnosis__factory.connect(veaInboxAddress, getWallet(privateKey, web3ProviderURL));
  } else {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }
}

function getVeaOutboxProvider(veaOutboxAddress: string, privateKey: string, rpc: JsonRpcProvider, chainId: number) {
  if (chainId == 11155111) {
    return VeaOutboxArbToEth__factory.connect(veaOutboxAddress, getWalletRPC(privateKey, rpc));
  } else if (chainId == 10200) {
    return VeaOutboxArbToGnosis__factory.connect(veaOutboxAddress, getWalletRPC(privateKey, rpc));
  } else {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }
}

function getVeaOutboxArbToEthDevnetProvider(veaOutboxAddress: string, privateKey: string, rpc: JsonRpcProvider) {
  return VeaOutboxArbToEthDevnet__factory.connect(veaOutboxAddress, getWalletRPC(privateKey, rpc));
}

function getVeaOutboxArbToEthDevnet(veaOutboxAddress: string, privateKey: string, web3ProviderURL: string) {
  return VeaOutboxArbToEthDevnet__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
}

export {
  getWalletRPC,
  getVeaOutboxArbToEthDevnetProvider,
  getVeaOutbox,
  getVeaInbox,
  getVeaOutboxProvider,
  getVeaInboxProvider,
  getVeaOutboxArbToEthDevnet,
};

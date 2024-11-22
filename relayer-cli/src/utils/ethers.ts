import { Wallet, JsonRpcProvider, Provider } from "ethers";
import {
  VeaOutboxArbToEth__factory,
  VeaOutboxArbToEthDevnet__factory,
  VeaInboxArbToEth__factory,
  VeaInboxArbToGnosis__factory,
  VeaOutboxArbToGnosis__factory,
} from "@kleros/vea-contracts/typechain-types";
import { getBridgeConfig } from "consts/bridgeRoutes";

function getWallet(privateKey: string, web3ProviderURL: string): Wallet {
  return new Wallet(privateKey, new JsonRpcProvider(web3ProviderURL));
}

function getWalletRPC(privateKey: string, rpc: Provider): Wallet {
  return new Wallet(privateKey, rpc);
}

// Using destination chainId as identifier, Ex: Arbitrum One (42161) -> Ethereum Mainnet (1): Use "1" as chainId
function getVeaInbox(veaInboxAddress: string, privateKey: string, web3ProviderURL: string, chainId: number) {
  const bridge = getBridgeConfig(chainId);
  switch (bridge.chain) {
    case "sepolia":
    case "mainnet":
      return VeaInboxArbToEth__factory.connect(veaInboxAddress, getWallet(privateKey, web3ProviderURL));
    case "chiado":
    case "gnosis":
      return VeaInboxArbToGnosis__factory.connect(veaInboxAddress, getWallet(privateKey, web3ProviderURL));
    default:
      throw new Error(`Unsupported chainId: ${chainId}`);
  }
}

function getVeaInboxProvider(veaInboxAddress: string, privateKey: string, rpc: JsonRpcProvider, chainId: number) {
  const bridges = getBridgeConfig(chainId);
  switch (bridges.chain) {
    case "sepolia":
    case "mainnet":
      return VeaInboxArbToEth__factory.connect(veaInboxAddress, getWalletRPC(privateKey, rpc));
    case "chiado":
    case "gnosis":
      return VeaInboxArbToGnosis__factory.connect(veaInboxAddress, getWalletRPC(privateKey, rpc));
    default:
      throw new Error(`Unsupported chainId: ${chainId}`);
  }
}

function getVeaOutbox(veaOutboxAddress: string, privateKey: string, web3ProviderURL: string, chainId: number) {
  const bridge = getBridgeConfig(chainId);
  switch (bridge.chain) {
    case "sepolia":
    case "mainnet":
      return VeaOutboxArbToEth__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
    case "chiado":
    case "gnosis":
      return VeaOutboxArbToGnosis__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
    default:
      throw new Error(`Unsupported chainId: ${chainId}`);
  }
}

function getVeaOutboxProvider(veaOutboxAddress: string, privateKey: string, rpc: JsonRpcProvider, chainId: number) {
  const bridges = getBridgeConfig(chainId);
  switch (bridges.chain) {
    case "sepolia":
    case "mainnet":
      return VeaOutboxArbToEth__factory.connect(veaOutboxAddress, getWalletRPC(privateKey, rpc));
    case "chiado":
    case "gnosis":
      return VeaOutboxArbToGnosis__factory.connect(veaOutboxAddress, getWalletRPC(privateKey, rpc));
    default:
      throw new Error(`Unsupported chainId: ${chainId}`);
  }
}

function getVeaOutboxArbToEthDevnetProvider(veaOutboxAddress: string, privateKey: string, rpc: Provider) {
  return VeaOutboxArbToEthDevnet__factory.connect(veaOutboxAddress, getWalletRPC(privateKey, rpc));
}

function getVeaOutboxArbToEthDevnet(veaOutboxAddress: string, privateKey: string, web3ProviderURL: string) {
  return VeaOutboxArbToEthDevnet__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
}

function getVeaOutboxArbToGnosisProvider(veaOutboxAddress: string, privateKey: string, rpc: Provider) {
  return VeaOutboxArbToGnosisDevnet__factory.connect(veaOutboxAddress, getWalletRPC(privateKey, rpc));
}

function getVeaOutboxArbToGnosis(veaOutboxAddress: string, privateKey: string, web3ProviderURL: string) {
  return VeaOutboxArbToGnosisDevnet__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
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

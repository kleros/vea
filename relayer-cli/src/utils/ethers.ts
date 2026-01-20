import { Wallet, JsonRpcProvider, Provider } from "ethers";
import {
  VeaOutboxArbToEth__factory,
  VeaOutboxArbToEthDevnet__factory,
  VeaInboxArbToEth__factory,
  VeaInboxArbToGnosis__factory,
  VeaOutboxArbToGnosis__factory,
  VeaOutboxArbToGnosisDevnet__factory,
  TransactionBatcher__factory,
} from "../../../contracts/typechain-types";
import { getBridgeConfig, Network } from "../consts/bridgeRoutes";

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
      return VeaInboxArbToEth__factory.connect(veaInboxAddress, getWallet(privateKey, web3ProviderURL));
    case "chiado":
      return VeaInboxArbToGnosis__factory.connect(veaInboxAddress, getWallet(privateKey, web3ProviderURL));
    default:
      throw new Error(`Unsupported chainId: ${chainId}`);
  }
}

function getVeaInboxProvider(veaInboxAddress: string, privateKey: string, rpc: JsonRpcProvider, chainId: number) {
  const bridges = getBridgeConfig(chainId);
  switch (bridges.chain) {
    case "sepolia":
      return VeaInboxArbToEth__factory.connect(veaInboxAddress, getWalletRPC(privateKey, rpc));
    case "chiado":
      return VeaInboxArbToGnosis__factory.connect(veaInboxAddress, getWalletRPC(privateKey, rpc));
    default:
      throw new Error(`Unsupported chainId: ${chainId}`);
  }
}

function getVeaOutbox(
  veaOutboxAddress: string,
  privateKey: string,
  web3ProviderURL: string,
  chainId: number,
  network: Network
) {
  const bridge = getBridgeConfig(chainId);
  switch (bridge.chain) {
    case "sepolia": {
      switch (network) {
        case Network.DEVNET:
          return VeaOutboxArbToEthDevnet__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
        case Network.TESTNET:
          return VeaOutboxArbToEth__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
        default:
          throw new Error(`Unsupported network for sepolia: ${network}`);
      }
    }
    case "chiado": {
      switch (network) {
        case Network.DEVNET:
          return VeaOutboxArbToGnosisDevnet__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
        case Network.TESTNET:
          return VeaOutboxArbToGnosis__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
        default:
          throw new Error(`Unsupported network for chiado: ${network}`);
      }
    }
    default:
      throw new Error(`Unsupported chainId: ${chainId}`);
  }
}

function getVeaOutboxProvider(
  veaOutboxAddress: string,
  privateKey: string,
  rpc: JsonRpcProvider,
  chainId: number,
  network: Network
) {
  const bridges = getBridgeConfig(chainId);
  switch (bridges.chain) {
    case "sepolia": {
      switch (network) {
        case Network.DEVNET:
          return VeaOutboxArbToEthDevnet__factory.connect(veaOutboxAddress, getWalletRPC(privateKey, rpc));
        case Network.TESTNET:
          return VeaOutboxArbToEth__factory.connect(veaOutboxAddress, getWalletRPC(privateKey, rpc));
        default:
          throw new Error(`Unsupported network for sepolia: ${network}`);
      }
    }
    case "chiado": {
      switch (network) {
        case Network.DEVNET:
          return VeaOutboxArbToGnosisDevnet__factory.connect(veaOutboxAddress, getWalletRPC(privateKey, rpc));
        case Network.TESTNET:
          return VeaOutboxArbToGnosis__factory.connect(veaOutboxAddress, getWalletRPC(privateKey, rpc));
        default:
          throw new Error(`Unsupported network for chiado: ${network}`);
      }
    }
    default:
      throw new Error(`Unsupported chainId: ${chainId}`);
  }
}
function getBatcher(batcherAddress: string, privateKey: string, web3ProviderURL: string) {
  return TransactionBatcher__factory.connect(batcherAddress, getWallet(privateKey, web3ProviderURL));
}

export { getWalletRPC, getVeaOutbox, getVeaInbox, getVeaOutboxProvider, getVeaInboxProvider, getBatcher };

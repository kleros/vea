import { Wallet } from "@ethersproject/wallet";
import { JsonRpcProvider } from "@ethersproject/providers";
import {
  VeaOutboxArbToEth__factory,
  VeaOutboxArbToEthDevnet__factory,
  VeaOutboxArbToGnosisDevnet__factory,
  VeaInboxArbToEth__factory,
  VeaInboxArbToGnosis__factory,
  VeaOutboxArbToGnosis__factory,
} from "@kleros/vea-contracts/typechain-types";
import { getBridgeConfig } from "consts/bridgeRoutes";

function getWallet(privateKey: string, web3ProviderURL: string) {
  return new Wallet(privateKey, new JsonRpcProvider(web3ProviderURL));
}

function getWalletRPC(privateKey: string, rpc: JsonRpcProvider) {
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

function getVeaOutboxDevnet(veaOutboxAddress: string, privateKey: string, web3ProviderURL: string, chainId: number) {
  if (chainId == 11155111) {
    return VeaOutboxArbToEthDevnet__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
  } else if (chainId == 10200) {
    return VeaOutboxArbToGnosisDevnet__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
  } else {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }
}

export { getWalletRPC, getVeaOutbox, getVeaInbox, getVeaOutboxDevnet };

import { Wallet, JsonRpcProvider } from "ethers";
import {
  VeaOutboxArbToEth__factory,
  VeaOutboxArbToGnosis__factory,
  VeaOutboxArbToEthDevnet__factory,
  VeaOutboxArbToGnosisDevnet__factory,
  VeaOutboxMultiChallenge__factory,
  VeaInboxArbToEth__factory,
  VeaInboxArbToGnosis__factory,
  IWETH__factory,
  RouterArbToGnosis__factory,
  IAMB__factory,
} from "@kleros/vea-contracts/typechain-types";

function getWallet(privateKey: string, web3ProviderURL: string) {
  return new Wallet(privateKey, new JsonRpcProvider(web3ProviderURL));
}

function getWalletRPC(privateKey: string, rpc: JsonRpcProvider) {
  return new Wallet(privateKey, rpc);
}

function getVeaInboxArbToEth(veaInboxAddress: string, privateKey: string, web3ProviderURL: string) {
  return VeaInboxArbToEth__factory.connect(veaInboxAddress, getWallet(privateKey, web3ProviderURL));
}

function getVeaInboxArbToEthProvider(veaInboxAddress: string, privateKey: string, rpc: JsonRpcProvider) {
  return VeaInboxArbToEth__factory.connect(veaInboxAddress, getWalletRPC(privateKey, rpc));
}

function getVeaOutboxArbToEthProvider(veaOutboxAddress: string, privateKey: string, rpc: JsonRpcProvider) {
  return VeaOutboxArbToEth__factory.connect(veaOutboxAddress, getWalletRPC(privateKey, rpc));
}

function getVeaOutboxMultiChallengeProvider(veaOutboxAddress: string, privateKey: string, rpc: JsonRpcProvider) {
  return VeaOutboxMultiChallenge__factory.connect(veaOutboxAddress, getWalletRPC(privateKey, rpc));
}

function getVeaOutboxArbToGnosisProvider(veaOutboxAddress: string, privateKey: string, rpc: JsonRpcProvider) {
  return VeaOutboxArbToGnosis__factory.connect(veaOutboxAddress, getWalletRPC(privateKey, rpc));
}

function getVeaInboxArbToGnosisProvider(veaInboxAddress: string, privateKey: string, rpc: JsonRpcProvider) {
  return VeaInboxArbToGnosis__factory.connect(veaInboxAddress, getWalletRPC(privateKey, rpc));
}

function getWETHProvider(WETH: string, privateKey: string, rpc: JsonRpcProvider) {
  return IWETH__factory.connect(WETH, getWalletRPC(privateKey, rpc));
}

function getVeaOutboxArbToEth(veaOutboxAddress: string, privateKey: string, web3ProviderURL: string) {
  return VeaOutboxArbToEth__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
}

function getVeaOutboxArbToEthDevnetProvider(veaOutboxAddress: string, privateKey: string, rpc: JsonRpcProvider) {
  return VeaOutboxArbToEthDevnet__factory.connect(veaOutboxAddress, getWalletRPC(privateKey, rpc));
}

function getVeaOutboxArbToEthDevnet(veaOutboxAddress: string, privateKey: string, web3ProviderURL: string) {
  return VeaOutboxArbToEthDevnet__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
}

function getVeaOutboxArbToGnosis(veaOutboxAddress: string, privateKey: string, web3ProviderURL: string) {
  return VeaOutboxArbToGnosisDevnet__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
}

function getVeaRouterArbToGnosisProvider(veaRouterAddress: string, privateKey: string, rpc: JsonRpcProvider) {
  return RouterArbToGnosis__factory.connect(veaRouterAddress, getWalletRPC(privateKey, rpc));
}

function getAMBProvider(ambAddress: string, privateKey: string, rpc: JsonRpcProvider) {
  return IAMB__factory.connect(ambAddress, getWalletRPC(privateKey, rpc));
}
export {
  getVeaOutboxArbToEth,
  getWalletRPC,
  getVeaOutboxArbToEthDevnetProvider,
  getVeaInboxArbToEth,
  getVeaInboxArbToEthProvider,
  getVeaOutboxArbToEthProvider,
  getVeaOutboxArbToGnosisProvider,
  getVeaInboxArbToGnosisProvider,
  getVeaRouterArbToGnosisProvider,
  getWETHProvider,
  getAMBProvider,
};

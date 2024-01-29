import { Wallet } from "@ethersproject/wallet";
import { JsonRpcProvider } from "@ethersproject/providers";
import {
  VeaOutboxArbToEth__factory,
  VeaOutboxArbToEthDevnet__factory,
  VeaOutboxArbToGnosisDevnet__factory,
  VeaInboxArbToEth__factory,
} from "../../typechain-types";

export function getWallet(privateKey: string, web3ProviderURL: string) {
  return new Wallet(privateKey, new JsonRpcProvider(web3ProviderURL));
}

export function getWalletRPC(privateKey: string, rpc: JsonRpcProvider) {
  return new Wallet(privateKey, rpc);
}

export function getVeaInboxArbToEth(veaInboxAddress: string, privateKey: string, web3ProviderURL: string) {
  return VeaInboxArbToEth__factory.connect(veaInboxAddress, getWallet(privateKey, web3ProviderURL));
}

export function getVeaInboxArbToEthProvider(veaInboxAddress: string, privateKey: string, rpc: JsonRpcProvider) {
  return VeaInboxArbToEth__factory.connect(veaInboxAddress, getWalletRPC(privateKey, rpc));
}

export function getVeaOutboxArbToEthProvider(veaOutboxAddress: string, privateKey: string, rpc: JsonRpcProvider) {
  return VeaOutboxArbToEth__factory.connect(veaOutboxAddress, getWalletRPC(privateKey, rpc));
}

export function getVeaOutboxArbToEth(veaOutboxAddress: string, privateKey: string, web3ProviderURL: string) {
  return VeaOutboxArbToEth__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
}

export function getVeaOutboxArbToEthDevnetProvider(veaOutboxAddress: string, privateKey: string, rpc: JsonRpcProvider) {
  return VeaOutboxArbToEthDevnet__factory.connect(veaOutboxAddress, getWalletRPC(privateKey, rpc));
}

export function getVeaOutboxArbToEthDevnet(veaOutboxAddress: string, privateKey: string, web3ProviderURL: string) {
  return VeaOutboxArbToEthDevnet__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
}

export function getVeaOutboxArbToGnosisProvider(veaOutboxAddress: string, privateKey: string, rpc: JsonRpcProvider) {
  return VeaOutboxArbToGnosisDevnet__factory.connect(veaOutboxAddress, getWalletRPC(privateKey, rpc));
}

export function getVeaOutboxArbToGnosis(veaOutboxAddress: string, privateKey: string, web3ProviderURL: string) {
  return VeaOutboxArbToGnosisDevnet__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
}

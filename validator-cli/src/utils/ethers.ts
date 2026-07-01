import { Wallet, JsonRpcProvider } from "ethers";
import {
  VeaOutboxArbToEth__factory,
  VeaOutboxArbToGnosis__factory,
  VeaOutboxArbToGnosisDevnet__factory,
  VeaOutboxArbToEthDevnet__factory,
  VeaInboxArbToEth__factory,
  VeaInboxArbToGnosis__factory,
  IWETH__factory,
  RouterArbToGnosis__factory,
  IAMB__factory,
} from "../../../contracts/typechain-types";
import { NotDefinedError, InvalidNetworkError } from "./errors";
import { Network } from "../consts/bridgeRoutes";

function getWallet(privateKey: string, rpc: JsonRpcProvider) {
  return new Wallet(privateKey, rpc);
}

function getWalletRPC(privateKey: string, rpc: JsonRpcProvider) {
  return new Wallet(privateKey, rpc);
}

function getVeaInbox(veaInboxAddress: string, privateKey: string, rpc: JsonRpcProvider, chainId: number, network) {
  switch (chainId) {
    case 11155111:
      return VeaInboxArbToEth__factory.connect(veaInboxAddress, getWallet(privateKey, rpc));
    case 10200:
      return VeaInboxArbToGnosis__factory.connect(veaInboxAddress, getWallet(privateKey, rpc));
    default:
      throw new NotDefinedError("VeaInbox");
  }
}

function getVeaOutbox(
  veaOutboxAddress: string,
  privateKey: string,
  rpc: JsonRpcProvider,
  chainId: number,
  network: Network
) {
  switch (chainId) {
    case 11155111:
      switch (network) {
        case Network.DEVNET:
          return VeaOutboxArbToEthDevnet__factory.connect(veaOutboxAddress, getWallet(privateKey, rpc));
        case Network.TESTNET:
          return VeaOutboxArbToEth__factory.connect(veaOutboxAddress, getWallet(privateKey, rpc));
        default:
          throw new InvalidNetworkError(`${network}(veaOutbox)`);
      }

    case 10200:
      switch (network) {
        case Network.DEVNET:
          return VeaOutboxArbToGnosisDevnet__factory.connect(veaOutboxAddress, getWallet(privateKey, rpc));
        case Network.TESTNET:
          return VeaOutboxArbToGnosis__factory.connect(veaOutboxAddress, getWallet(privateKey, rpc));
        default:
          throw new InvalidNetworkError(`${network}(veaOutbox)`);
      }
    default:
      throw new NotDefinedError("VeaOutbox");
  }
}

function getVeaRouter(veaRouterAddress: string, privateKey: string, rpc: JsonRpcProvider, chainId: number) {
  switch (chainId) {
    case 10200:
      return RouterArbToGnosis__factory.connect(veaRouterAddress, getWallet(privateKey, rpc));
  }
}

function getWETH(WETH: string, privateKey: string, rpc: JsonRpcProvider) {
  return IWETH__factory.connect(WETH, getWallet(privateKey, rpc));
}

function getVeaOutboxArbToEthDevnet(veaOutboxAddress: string, privateKey: string, rpc: JsonRpcProvider) {
  return VeaOutboxArbToEthDevnet__factory.connect(veaOutboxAddress, getWallet(privateKey, rpc));
}

function getAMB(ambAddress: string, privateKey: string, rpc: JsonRpcProvider) {
  return IAMB__factory.connect(ambAddress, getWallet(privateKey, rpc));
}

export {
  getWalletRPC,
  getWallet,
  getVeaInbox,
  getVeaOutbox,
  getVeaOutboxArbToEthDevnet,
  getWETH,
  getAMB,
  getVeaRouter,
};

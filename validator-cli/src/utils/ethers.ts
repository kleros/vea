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
} from "@kleros/vea-contracts/typechain-types";
import { challengeAndResolveClaim as challengeAndResolveClaimArbToEth } from "../ArbToEth/validator";
import { checkAndClaim } from "../ArbToEth/claimer";
import { ArbToEthTransactionHandler } from "../ArbToEth/transactionHandler";
import { ArbToEthDevnetTransactionHandler } from "../ArbToEth/transactionHandlerDevnet";
import { TransactionHandlerNotDefinedError } from "./errors";
import { Network } from "../consts/bridgeRoutes";

function getWallet(privateKey: string, rpcUrl: string) {
  return new Wallet(privateKey, new JsonRpcProvider(rpcUrl));
}

function getWalletRPC(privateKey: string, rpc: JsonRpcProvider) {
  return new Wallet(privateKey, rpc);
}

function getVeaInbox(veaInboxAddress: string, privateKey: string, rpcUrl: string, chainId: number, network) {
  switch (chainId) {
    case 11155111:
      return VeaInboxArbToEth__factory.connect(veaInboxAddress, getWallet(privateKey, rpcUrl));
    case 10200:
      return VeaInboxArbToGnosis__factory.connect(veaInboxAddress, getWallet(privateKey, rpcUrl));
  }
}

function getVeaOutbox(veaOutboxAddress: string, privateKey: string, rpcUrl: string, chainId: number, network: Network) {
  switch (chainId) {
    case 11155111:
      switch (network) {
        case Network.DEVNET:
          return VeaOutboxArbToEthDevnet__factory.connect(veaOutboxAddress, getWallet(privateKey, rpcUrl));
        case Network.TESTNET:
          return VeaOutboxArbToEth__factory.connect(veaOutboxAddress, getWallet(privateKey, rpcUrl));
      }

    case 10200:
      switch (network) {
        case Network.DEVNET:
          return VeaOutboxArbToGnosisDevnet__factory.connect(veaOutboxAddress, getWallet(privateKey, rpcUrl));
        case Network.TESTNET:
          return VeaOutboxArbToGnosis__factory.connect(veaOutboxAddress, getWallet(privateKey, rpcUrl));
      }
  }
}

function getVeaRouter(veaRouterAddress: string, privateKey: string, rpcUrl: string, chainId: number) {
  switch (chainId) {
    case 10200:
      return RouterArbToGnosis__factory.connect(veaRouterAddress, getWallet(privateKey, rpcUrl));
  }
}

function getWETH(WETH: string, privateKey: string, rpcUrl: string) {
  return IWETH__factory.connect(WETH, getWallet(privateKey, rpcUrl));
}

function getVeaOutboxArbToEthDevnet(veaOutboxAddress: string, privateKey: string, rpcUrl: string) {
  return VeaOutboxArbToEthDevnet__factory.connect(veaOutboxAddress, getWallet(privateKey, rpcUrl));
}

function getAMB(ambAddress: string, privateKey: string, rpcUrl: string) {
  return IAMB__factory.connect(ambAddress, getWallet(privateKey, rpcUrl));
}

const getClaimValidator = (chainId: number, network: Network) => {
  switch (chainId) {
    case 11155111:
      return challengeAndResolveClaimArbToEth;
  }
};
const getClaimer = (chainId: number, network: Network) => {
  switch (chainId) {
    case 11155111:
      switch (network) {
        case Network.DEVNET:

        case Network.TESTNET:
          return checkAndClaim;
      }
  }
};
const getTransactionHandler = (chainId: number, network: Network) => {
  switch (chainId) {
    case 11155111:
      switch (network) {
        case Network.DEVNET:
          return ArbToEthDevnetTransactionHandler;
        case Network.TESTNET:
          return ArbToEthTransactionHandler;
      }
    default:
      throw new TransactionHandlerNotDefinedError();
  }
};
export {
  getWalletRPC,
  getWallet,
  getVeaInbox,
  getVeaOutbox,
  getVeaOutboxArbToEthDevnet,
  getWETH,
  getAMB,
  getClaimValidator,
  getClaimer,
  getTransactionHandler,
  getVeaRouter,
};

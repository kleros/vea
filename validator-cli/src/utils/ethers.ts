import { Wallet, JsonRpcProvider } from "ethers";
import {
  VeaOutboxArbToEth__factory,
  VeaOutboxArbToGnosis__factory,
  VeaOutboxArbToEthDevnet__factory,
  VeaInboxArbToEth__factory,
  VeaInboxArbToGnosis__factory,
  IWETH__factory,
  RouterArbToGnosis__factory,
  IAMB__factory,
} from "@kleros/vea-contracts/typechain-types";
import { challengeAndResolveClaim as challengeAndResolveClaimArbToEth } from "../ArbToEth/validator";
import { ArbToEthTransactionHandler } from "../ArbToEth/transactionHandler";

function getWallet(privateKey: string, web3ProviderURL: string) {
  return new Wallet(privateKey, new JsonRpcProvider(web3ProviderURL));
}

function getWalletRPC(privateKey: string, rpc: JsonRpcProvider) {
  return new Wallet(privateKey, rpc);
}

function getVeaInbox(veaInboxAddress: string, privateKey: string, web3ProviderURL: string, chainId: number) {
  switch (chainId) {
    case 11155111:
      return VeaInboxArbToEth__factory.connect(veaInboxAddress, getWallet(privateKey, web3ProviderURL));
    case 10200:
      return VeaInboxArbToGnosis__factory.connect(veaInboxAddress, getWallet(privateKey, web3ProviderURL));
  }
}

function getVeaOutbox(veaOutboxAddress: string, privateKey: string, web3ProviderURL: string, chainId: number) {
  switch (chainId) {
    case 11155111:
      return VeaOutboxArbToEth__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
    case 10200:
      return VeaOutboxArbToGnosis__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
  }
}

function getVeaRouter(veaRouterAddress: string, privateKey: string, web3ProviderURL: string, chainId: number) {
  switch (chainId) {
    case 10200:
      return RouterArbToGnosis__factory.connect(veaRouterAddress, getWallet(privateKey, web3ProviderURL));
  }
}

function getWETH(WETH: string, privateKey: string, web3ProviderURL: string) {
  return IWETH__factory.connect(WETH, getWallet(privateKey, web3ProviderURL));
}

function getVeaOutboxArbToEthDevnet(veaOutboxAddress: string, privateKey: string, web3ProviderURL: string) {
  return VeaOutboxArbToEthDevnet__factory.connect(veaOutboxAddress, getWallet(privateKey, web3ProviderURL));
}

function getAMB(ambAddress: string, privateKey: string, web3ProviderURL: string) {
  return IAMB__factory.connect(ambAddress, getWallet(privateKey, web3ProviderURL));
}

const getClaimValidator = (chainId: number) => {
  switch (chainId) {
    case 11155111:
      return challengeAndResolveClaimArbToEth;
  }
};

const getTransactionHandler = (chainId: number) => {
  switch (chainId) {
    case 11155111:
      return ArbToEthTransactionHandler;
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
  getTransactionHandler,
  getVeaRouter,
};

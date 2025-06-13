import { ITransactionHandler, BaseTransactionHandler } from "./baseTransactionHandler";
import { ArbToEthTransactionHandler, ArbToEthDevnetTransactionHandler } from "./arbToEthHandler";
import { ArbToGnosisTransactionHandler, ArbToGnosisDevnetTransactionHandler } from "./arbToGnosisHandler";
import { InvalidNetworkError, NotDefinedError } from "../../utils/errors";
import { Network } from "../../consts/bridgeRoutes";
export {
  ArbToEthTransactionHandler,
  ArbToEthDevnetTransactionHandler,
  ArbToGnosisTransactionHandler,
  ArbToGnosisDevnetTransactionHandler,
  BaseTransactionHandler,
  ITransactionHandler,
};

export interface IDevnetTransactionHandler extends ITransactionHandler {
  devnetAdvanceState(stateRoot: string): Promise<void>;
}

export const getTransactionHandler = (chainId: number, network: Network) => {
  if (chainId === 11155111) {
    if (network === Network.DEVNET) {
      return ArbToEthDevnetTransactionHandler;
    } else if (network === Network.TESTNET) {
      return ArbToEthTransactionHandler;
    } else {
      throw new InvalidNetworkError(`${network}(transactionHandler)`);
    }
  } else if (chainId === 10200) {
    if (network === Network.DEVNET) {
      return ArbToGnosisDevnetTransactionHandler;
    } else if (network === Network.TESTNET) {
      return ArbToGnosisTransactionHandler;
    } else {
      throw new InvalidNetworkError(`${network}(transactionHandler)`);
    }
  } else {
    throw new NotDefinedError("Transaction Handler");
  }
};

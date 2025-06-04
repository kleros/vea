import { ITransactionHandler } from "./baseTransactionHandler";
import { ArbToEthTransactionHandler, ArbToEthDevnetTransactionHandler } from "./arbToEthHandler";
import { ArbToGnosisTransactionHandler, ArbToGnosisDevnetTransactionHandler } from "./arbToGnosisHandler";
import { BaseTransactionHandler } from "./baseTransactionHandler";

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

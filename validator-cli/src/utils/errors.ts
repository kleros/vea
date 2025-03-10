import { BotPaths } from "./botConfig";
import { Network } from "../consts/bridgeRoutes";
class ClaimNotFoundError extends Error {
  constructor(epoch: number) {
    super();
    this.name = "ClaimNotFoundError";
    this.message = `No claim was found for ${epoch}`;
  }
}

class ClaimNotSetError extends Error {
  constructor() {
    super();
    this.name = "NoClaimSetError";
    this.message = "Claim is not set";
  }
}

class TransactionHandlerNotDefinedError extends Error {
  constructor() {
    super();
    this.name = "TransactionHandlerNotDefinedError";
    this.message = "TransactionHandler is not defined";
  }
}

class InvalidBotPathError extends Error {
  constructor() {
    super();
    this.name = "InvalidBotPath";
    this.message = `Invalid path provided, Use one of: ${Object.keys(BotPaths).join("), ")}`;
  }
}

class DevnetOwnerNotSetError extends Error {
  constructor() {
    super();
    this.name = "DevnetOwnerNotSetError";
    this.message = "Devnet owner address not set";
  }
}

class InvalidNetworkError extends Error {
  constructor(network: string) {
    super();
    this.name = "InvalidNetworkError";
    this.message = `Invalid network: ${network}, use from: ${Object.values(Network).join(", ")}`;
  }
}

export {
  ClaimNotFoundError,
  ClaimNotSetError,
  TransactionHandlerNotDefinedError,
  InvalidBotPathError,
  DevnetOwnerNotSetError,
  InvalidNetworkError,
};

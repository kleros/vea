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

export { ClaimNotFoundError, ClaimNotSetError, TransactionHandlerNotDefinedError };

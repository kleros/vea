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

class ContractNotSupportedError extends Error {
  constructor(contract: string) {
    super();
    this.name = "ContractNotSupportedError";
    this.message = `Unsupported contract type: ${contract}`;
  }
}

export { ClaimNotFoundError, ClaimNotSetError, ContractNotSupportedError };

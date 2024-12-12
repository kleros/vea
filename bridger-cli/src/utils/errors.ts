/**
 * Custom errors for the CLI
 */
class ClaimNotFoundError extends Error {
  constructor(epoch: number) {
    super();
    this.name = "ClaimNotFoundError";
    this.message = `No claim was found for ${epoch}`;
  }
}

class InvalidStartEpochError extends Error {
  constructor(epoch: number) {
    super();
    this.name = "InvalidStartEpochError";
    this.message = `Current epoch is smaller than start epoch ${epoch}`;
  }
}

class ClaimNotSetError extends Error {
  constructor() {
    super();
    this.name = "NoClaimSetError";
    this.message = "Claim is not set";
  }
}
export { ClaimNotFoundError, InvalidStartEpochError, ClaimNotSetError };

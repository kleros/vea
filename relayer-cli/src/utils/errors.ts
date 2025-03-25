export class NetworkConfigNotSet extends Error {
  constructor() {
    super();
    this.name = "NetworkConfigNotSet";
    this.message = `No valid network configuration found for the relayer, check the environment variables`;
  }
}

export class InvalidChainId extends Error {
  constructor(chainId: number) {
    super();
    this.name = "InvalidChainId";
    this.message = `Invalid chainId: ${chainId}`;
  }
}

export class MissingEnvironmentVariable extends Error {
  constructor(variable: string) {
    super();
    this.name = "MissingEnvironmentVariable";
    this.message = `Missing environment variable: ${variable}`;
  }
}

export class DataError extends Error {
  constructor(dataCall: string) {
    super();
    this.name = "DataError";
    this.message = `Data error for call: ${dataCall}`;
  }
}

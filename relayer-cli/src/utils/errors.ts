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
  constructor(dataCall: string, chainId: number, network: string, options?: { cause?: unknown }) {
    super(`Data error for call: ${dataCall}, Chain ID: ${chainId}, Network: ${network}`);
    this.name = "DataError";
    if (options?.cause !== undefined) {
      (this as any).cause = options.cause;
    }
  }
}

export class ExecutionError extends Error {
  constructor(executionCall: string, chainId: number, network: string, options?: { cause?: unknown }) {
    super(`Error during execution for: ${executionCall}, Chain ID: ${chainId}, Network: ${network}`);
    this.name = "ExecutionError";
    if (options?.cause !== undefined) {
      (this as any).cause = options.cause;
    }
  }
}

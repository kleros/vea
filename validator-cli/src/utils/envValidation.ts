import { ethers } from "ethers";
import { Network, getBridgeConfig } from "../consts/bridgeRoutes";
import { EnvValidationError } from "./errors";
import { FallbackRpcProvider } from "./fallbackProvider";
import { defaultEmitter } from "./emitter";

/**
 * The slice of a provider the preflight needs. Kept minimal so the checks can be
 * exercised without a chain.
 */
export interface PreflightProvider {
  getNetwork(): Promise<{ chainId: number | bigint }>;
  getCode(address: string): Promise<string>;
  getBalance(address: string): Promise<bigint>;
}

export interface ValidatedEnvironment {
  signerAddress: string;
  chainIds: number[];
  networks: Network[];
  envioUrl: string;
  warnings: string[];
}

export interface ValidateEnvironmentParams {
  env?: Record<string, string | undefined>;
  fetchBridgeConfig?: typeof getBridgeConfig;
  createProvider?: (urls: string[], expectedChainId: number) => PreflightProvider;
  readDepositTokenBalance?: (
    token: string,
    owner: string,
    spender: string,
    provider: PreflightProvider
  ) => Promise<{ balance: bigint; allowance: bigint }>;
}

const splitList = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
];

/**
 * Build a provider for the preflight to probe with.
 *
 * Deliberately constructed *without* the expected chain id. FallbackRpcProvider
 * short-circuits `_detectNetwork` to the configured value when it is given one,
 * which would make the chain-id check compare the expectation against itself and
 * silently pass an endpoint pointed at the wrong network.
 */
export const defaultCreateProvider = (urls: string[], _expectedChainId: number): PreflightProvider =>
  new FallbackRpcProvider(urls, defaultEmitter) as unknown as PreflightProvider;

const defaultReadDepositTokenBalance = async (
  token: string,
  owner: string,
  spender: string,
  provider: PreflightProvider
): Promise<{ balance: bigint; allowance: bigint }> => {
  const erc20 = new ethers.Contract(token, ERC20_ABI, provider as any);
  const [balance, allowance] = await Promise.all([
    erc20.balanceOf(owner),
    spender ? erc20.allowance(owner, spender) : Promise.resolve(0n),
  ]);
  return { balance: BigInt(balance), allowance: BigInt(allowance) };
};

/**
 * Validate the whole environment before the bot does anything else.
 *
 * Every problem is collected and reported together: fixing one variable,
 * restarting, and discovering the next one is a slow way to configure a
 * validator. Static checks run first and abort before any network call, so a
 * typo never costs an RPC round trip.
 *
 * @returns The validated configuration, with any non-fatal warnings
 * @throws EnvValidationError listing every problem found
 */
export const validateEnvironment = async ({
  env = process.env,
  fetchBridgeConfig = getBridgeConfig,
  createProvider = defaultCreateProvider,
  readDepositTokenBalance = defaultReadDepositTokenBalance,
}: ValidateEnvironmentParams = {}): Promise<ValidatedEnvironment> => {
  const problems: string[] = [];
  const warnings: string[] = [];

  const signerAddress = validatePrivateKey(env, problems);
  const chainIds = validateChainIds(env, problems, fetchBridgeConfig);
  const networks = validateNetworks(env, problems);
  const envioUrl = validateEnvioUrl(env, problems);
  validateRoutes(chainIds, problems, fetchBridgeConfig);

  if (problems.length > 0) throw new EnvValidationError(problems);

  await runPreflight({
    chainIds,
    networks,
    signerAddress,
    problems,
    warnings,
    fetchBridgeConfig,
    createProvider,
    readDepositTokenBalance,
  });

  if (problems.length > 0) throw new EnvValidationError(problems);

  return { signerAddress, chainIds, networks, envioUrl, warnings };
};

interface PreflightParams {
  chainIds: number[];
  networks: Network[];
  signerAddress: string;
  problems: string[];
  warnings: string[];
  fetchBridgeConfig: typeof getBridgeConfig;
  createProvider: (urls: string[], expectedChainId: number) => PreflightProvider;
  readDepositTokenBalance: (
    token: string,
    owner: string,
    spender: string,
    provider: PreflightProvider
  ) => Promise<{ balance: bigint; allowance: bigint }>;
}

/** One endpoint the bot will actually talk to, and what it is expected to be. */
interface Endpoint {
  role: "inbox" | "outbox" | "router";
  envVar: string;
  urls: string[];
  expectedChainId: number;
  provider: PreflightProvider;
}

/**
 * Confirm the configured environment describes a chain the bot can actually work
 * on: every endpoint answers as the chain we think it is, the contracts we are
 * about to call exist, and the signer can pay for gas.
 *
 * Funding is reported rather than enforced, with one exception: a signer with
 * zero native balance cannot send any transaction at all, so that is fatal. A
 * balance merely below the deposit is runtime state, not misconfiguration, and
 * refusing to start on it would turn a transient funding gap into a dead bot.
 */
const runPreflight = async ({
  chainIds,
  networks,
  signerAddress,
  problems,
  warnings,
  fetchBridgeConfig,
  createProvider,
  readDepositTokenBalance,
}: PreflightParams): Promise<void> => {
  for (const chainId of chainIds) {
    const bridge = fetchBridgeConfig(chainId) as any;
    const { rpcEnvVars } = bridge;

    const endpoints: Endpoint[] = [
      {
        role: "outbox",
        envVar: rpcEnvVars.outbox,
        urls: bridge.outboxRPC,
        expectedChainId: chainId,
        provider: createProvider(bridge.outboxRPC, chainId),
      },
      {
        role: "inbox",
        envVar: rpcEnvVars.inbox,
        urls: bridge.inboxRPC,
        expectedChainId: bridge.inboxChainId,
        provider: createProvider(bridge.inboxRPC, bridge.inboxChainId),
      },
    ];
    if (rpcEnvVars.router && bridge.routerRPC) {
      endpoints.push({
        role: "router",
        envVar: rpcEnvVars.router,
        urls: bridge.routerRPC,
        expectedChainId: bridge.routerChainId,
        provider: createProvider(bridge.routerRPC, bridge.routerChainId),
      });
    }

    const reachable = await checkEndpointChains(endpoints, chainId, problems);
    await checkDeployments(reachable, bridge, networks, chainId, problems);
    await checkFunding(
      reachable,
      bridge,
      networks,
      chainId,
      signerAddress,
      problems,
      warnings,
      readDepositTokenBalance
    );
  }
};

/** Confirm each endpoint answers as the chain it is configured to be. */
const checkEndpointChains = async (endpoints: Endpoint[], chainId: number, problems: string[]): Promise<Endpoint[]> => {
  const reachable: Endpoint[] = [];
  for (const endpoint of endpoints) {
    try {
      const network = await endpoint.provider.getNetwork();
      const reported = Number(network.chainId);
      if (reported !== endpoint.expectedChainId) {
        problems.push(
          `${endpoint.envVar} (chain ${chainId} ${endpoint.role}) answers as chain ${reported}, expected ${endpoint.expectedChainId}.`
        );
        continue;
      }
      reachable.push(endpoint);
    } catch (error) {
      problems.push(
        `${endpoint.envVar} (chain ${chainId} ${endpoint.role}) is unreachable: ${(error as Error)?.message}`
      );
    }
  }
  return reachable;
};

/** Confirm the contracts we are about to call are deployed where we think. */
const checkDeployments = async (
  endpoints: Endpoint[],
  bridge: any,
  networks: Network[],
  chainId: number,
  problems: string[]
): Promise<void> => {
  const roleToContract: Record<string, string> = { inbox: "veaInbox", outbox: "veaOutbox", router: "veaRouter" };
  for (const network of networks) {
    const route = bridge.routeConfig[network];
    if (!route) {
      problems.push(`Chain ${chainId} has no ${network} deployment, but NETWORKS asks for it.`);
      continue;
    }
    for (const endpoint of endpoints) {
      const contract = route[roleToContract[endpoint.role]];
      if (!contract?.address) continue;
      try {
        const code = await endpoint.provider.getCode(contract.address);
        if (!code || code === "0x") {
          problems.push(`Chain ${chainId} ${network} ${endpoint.role} has no contract code at ${contract.address}.`);
        }
      } catch (error) {
        problems.push(
          `Chain ${chainId} ${network} ${endpoint.role} code check at ${contract.address} failed: ${
            (error as Error)?.message
          }`
        );
      }
    }
  }
};

/** Report what the signer can pay with; fail only when it can pay nothing. */
const checkFunding = async (
  endpoints: Endpoint[],
  bridge: any,
  networks: Network[],
  chainId: number,
  signerAddress: string,
  problems: string[],
  warnings: string[],
  readDepositTokenBalance: PreflightParams["readDepositTokenBalance"]
): Promise<void> => {
  const deposits = networks.map((network) => bridge.routeConfig[network]?.deposit).filter(Boolean) as bigint[];
  const largestDeposit = deposits.length > 0 ? deposits.reduce((a, b) => (a > b ? a : b)) : 0n;

  for (const endpoint of endpoints) {
    if (endpoint.role === "router") continue; // nothing is ever sent to the router chain
    let balance: bigint;
    try {
      balance = await endpoint.provider.getBalance(signerAddress);
    } catch (error) {
      problems.push(`Chain ${chainId} ${endpoint.role} balance check failed: ${(error as Error)?.message}`);
      continue;
    }
    if (balance === 0n) {
      problems.push(
        `Signer ${signerAddress} has no native balance on chain ${chainId} ${endpoint.role}; it cannot pay for gas.`
      );
      continue;
    }
    // Only a native-deposit route needs its balance to cover the deposit too.
    if (!bridge.depositToken && endpoint.role === "outbox" && balance < largestDeposit) {
      warnings.push(
        `Signer native balance on chain ${chainId} (${balance}) is below the deposit (${largestDeposit}); claims and challenges will revert until it is topped up.`
      );
    }
  }

  if (!bridge.depositToken) return;
  const outbox = endpoints.find((endpoint) => endpoint.role === "outbox");
  if (!outbox) return;
  const spender = networks.map((network) => bridge.routeConfig[network]?.veaOutbox?.address).find(Boolean) ?? "";
  try {
    const { balance, allowance } = await readDepositTokenBalance(
      bridge.depositToken,
      signerAddress,
      spender,
      outbox.provider
    );
    if (balance < largestDeposit) {
      warnings.push(`Deposit token balance on chain ${chainId} (${balance}) is below the deposit (${largestDeposit}).`);
    }
    if (allowance < largestDeposit) {
      warnings.push(
        `Deposit token allowance on chain ${chainId} (${allowance}) is below the deposit (${largestDeposit}); it is topped up lazily on first use.`
      );
    }
  } catch (error) {
    problems.push(`Chain ${chainId} deposit token check failed: ${(error as Error)?.message}`);
  }
};

const validatePrivateKey = (env: Record<string, string | undefined>, problems: string[]): string => {
  const privateKey = env.PRIVATE_KEY;
  if (!privateKey) {
    problems.push("PRIVATE_KEY is not set.");
    return "";
  }
  try {
    return new ethers.Wallet(privateKey).address;
  } catch {
    problems.push("PRIVATE_KEY is not a valid private key (expected a 32-byte hex string).");
    return "";
  }
};

const validateChainIds = (
  env: Record<string, string | undefined>,
  problems: string[],
  fetchBridgeConfig: typeof getBridgeConfig
): number[] => {
  const raw = splitList(env.VEAOUTBOX_CHAINS);
  if (raw.length === 0) {
    problems.push("VEAOUTBOX_CHAINS is empty; the validator would have no outbox to watch.");
    return [];
  }
  const chainIds: number[] = [];
  for (const entry of raw) {
    const chainId = Number(entry);
    if (!Number.isInteger(chainId)) {
      problems.push(`VEAOUTBOX_CHAINS contains "${entry}", which is not a chain id.`);
      continue;
    }
    try {
      fetchBridgeConfig(chainId);
    } catch {
      problems.push(`VEAOUTBOX_CHAINS contains ${chainId}, which has no configured bridge.`);
      continue;
    }
    chainIds.push(chainId);
  }
  return chainIds;
};

const validateNetworks = (env: Record<string, string | undefined>, problems: string[]): Network[] => {
  const raw = splitList(env.NETWORKS);
  if (raw.length === 0) {
    problems.push("NETWORKS is empty; the validator would start up and watch nothing.");
    return [];
  }
  const valid = Object.values(Network) as string[];
  const networks: Network[] = [];
  for (const entry of raw) {
    if (!valid.includes(entry)) {
      problems.push(`NETWORKS contains "${entry}"; expected one of: ${valid.join(", ")}.`);
      continue;
    }
    networks.push(entry as Network);
  }
  return networks;
};

const validateEnvioUrl = (env: Record<string, string | undefined>, problems: string[]): string => {
  const envioUrl = env.ENVIO_URL;
  if (!envioUrl) {
    problems.push("ENVIO_URL is not set; the subgraph fallback would fail exactly when it is needed.");
    return "";
  }
  if (!isHttpUrl(envioUrl)) {
    problems.push("ENVIO_URL is not a valid http(s) URL.");
    return "";
  }
  return envioUrl;
};

const validateRoutes = (chainIds: number[], problems: string[], fetchBridgeConfig: typeof getBridgeConfig): void => {
  for (const chainId of chainIds) {
    const bridge = fetchBridgeConfig(chainId) as any;
    const { rpcEnvVars } = bridge;

    const endpoints: Array<[string, string[] | undefined]> = [
      [rpcEnvVars.inbox, bridge.inboxRPC],
      [rpcEnvVars.outbox, bridge.outboxRPC],
    ];
    if (rpcEnvVars.router) endpoints.push([rpcEnvVars.router, bridge.routerRPC]);

    for (const [envVar, urls] of endpoints) {
      if (!urls || urls.length === 0) {
        problems.push(`${envVar} is empty but chain ${chainId} needs it.`);
        continue;
      }
      for (const url of urls) {
        if (!isHttpUrl(url)) problems.push(`${envVar} contains "${url}", which is not an http(s) URL.`);
      }
    }

    if (bridge.depositTokenEnvVar && !bridge.depositToken) {
      problems.push(`${bridge.depositTokenEnvVar} is not set but chain ${chainId} takes its deposit in that token.`);
    }
  }
};

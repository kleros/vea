import { EventEmitter } from "node:events";
import { ethers } from "ethers";
import { Network, getBridgeConfig } from "../consts/bridgeRoutes";
import { EnvValidationError } from "./errors";
import { FallbackRpcProvider, redactUrl, redactUrlsInText } from "./fallbackProvider";
import { defaultEmitter } from "./emitter";
import { BotEvents, AlertPayload } from "./botEvents";
import { hashClaim } from "./claim";

/**
 * The slice of a provider the preflight needs. Kept minimal so the checks can be
 * exercised without a chain.
 */
export interface PreflightProvider {
  getNetwork(): Promise<{ chainId: number | bigint }>;
  getCode(address: string): Promise<string>;
  getBalance(address: string): Promise<bigint>;
}

/** The fields of the outbox's `Claim` struct, in declaration order. */
export interface SyntheticClaim {
  stateRoot: string;
  claimer: string;
  timestampClaimed: number;
  timestampVerification: number;
  blocknumberVerification: number;
  honest: number;
  challenger: string;
}

/** Reads `hashClaim(claim)` from the outbox at `address` through `provider`. */
export type ReadOutboxHashClaim = (
  address: string,
  abi: unknown,
  claim: SyntheticClaim,
  provider: PreflightProvider
) => Promise<string>;

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
  readOutboxHashClaim?: ReadOutboxHashClaim;
  emitter?: EventEmitter;
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

const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

/** `scheme://host` of a configured value, or nothing when it does not parse; never the value itself. */
const describeUrl = (value: string): string => {
  const redacted = redactUrl(value);
  return redacted === "<redacted-url>" ? "an unparseable value" : redacted;
};

/**
 * A claim whose every field is non-zero and distinct, so the parity probe
 * exercises the whole packed encoding: a field dropped, reordered or resized on
 * either side changes the hash. `honest` is 2 (Challenger) for the same reason.
 */
export const PARITY_PROBE_CLAIM: SyntheticClaim = {
  stateRoot: ethers.keccak256(ethers.toUtf8Bytes("vea-validator hashClaim parity probe")),
  claimer: "0x1111111111111111111111111111111111111111",
  timestampClaimed: 0x01020304,
  timestampVerification: 0x05060708,
  blocknumberVerification: 0x090a0b0c,
  honest: 2,
  challenger: "0x2222222222222222222222222222222222222222",
};

const HASH_CLAIM_ABI = [
  "function hashClaim((bytes32 stateRoot,address claimer,uint32 timestampClaimed,uint32 timestampVerification,uint32 blocknumberVerification,uint8 honest,address challenger) _claim) pure returns (bytes32)",
];

/**
 * Call `hashClaim` with the ABI the bot itself uses for the outbox (the
 * deployment's), so a stale ABI fails here too; fall back to the struct's
 * known signature when a deployment carries no ABI.
 */
const defaultReadOutboxHashClaim: ReadOutboxHashClaim = async (address, abi, claim, provider) => {
  const hasHashClaim =
    Array.isArray(abi) && abi.some((fragment: any) => fragment?.type === "function" && fragment?.name === "hashClaim");
  const outbox = new ethers.Contract(address, hasHashClaim ? (abi as any) : HASH_CLAIM_ABI, provider as any);
  return String(await outbox.hashClaim(claim));
};

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
];

/**
 * Build a provider for the preflight to probe with. The preflight calls it with
 * a single URL to probe that endpoint alone, and with the whole list for the
 * contract and funding reads, which then go through the same failover as at runtime.
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
  readOutboxHashClaim = defaultReadOutboxHashClaim,
  emitter = defaultEmitter,
}: ValidateEnvironmentParams = {}): Promise<ValidatedEnvironment> => {
  const problems: string[] = [];
  const warnings: string[] = [];

  const signerAddress = validatePrivateKey(env, problems);
  const chainIds = validateChainIds(env, problems, fetchBridgeConfig);
  const networks = validateNetworks(env, problems);
  const envioUrl = validateEnvioUrl(env, problems);
  validateHeartbeatUrl(env, problems);
  validateRoutes(chainIds, problems, fetchBridgeConfig);

  if (problems.length > 0) throw new EnvValidationError(redactAll(problems));

  await runPreflight({
    chainIds,
    networks,
    signerAddress,
    problems,
    warnings,
    fetchBridgeConfig,
    createProvider,
    readDepositTokenBalance,
    readOutboxHashClaim,
    emitter,
  });

  if (problems.length > 0) throw new EnvValidationError(redactAll(problems));

  return { signerAddress, chainIds, networks, envioUrl, warnings: redactAll(warnings) };
};

/**
 * Last line of defence for the messages this module builds: every message names
 * endpoints by `describeUrl`, but RPC error text is quoted verbatim and ethers
 * puts the request URL into it.
 */
const redactAll = (messages: string[]): string[] => messages.map(redactUrlsInText);

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
  readOutboxHashClaim: ReadOutboxHashClaim;
  emitter: EventEmitter;
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
 * on: every reachable endpoint of every RPC list answers as the chain we think
 * it is, the outbox at the configured address hashes claims exactly as the bot
 * does, the other contracts exist, and the signer can pay for gas.
 *
 * Identity problems are fatal: a wrong chain or a wrong contract yields
 * confident wrong answers. An unreachable endpoint is not: it is dropped from
 * the shared bridge config (see `checkEndpointChains`), and only a list left
 * with no endpoint at all stops the bot, and so does a signer with no native balance on a
 * chain a route sends to (it cannot pay for any transaction). A balance merely below the
 * deposit is a warning, and runtime funding checks take it from there.
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
  readOutboxHashClaim,
  emitter,
}: PreflightParams): Promise<void> => {
  // Every configured route's config up front: one environment variable feeds
  // several lists (RPC_ARB every inbox, RPC_ETH an outbox and a router), and an
  // unreachable URL is pruned from all of them at once.
  const bridges = chainIds.map((chainId) => fetchBridgeConfig(chainId) as any);
  const probes = new Map<string, Promise<ProbeResult>>();
  const probe = (url: string, expectedChainId: number): Promise<ProbeResult> => {
    let result = probes.get(url);
    if (!result) {
      result = createProvider([url], expectedChainId)
        .getNetwork()
        .then(
          (network): ProbeResult => ({ chainId: Number(network.chainId) }),
          (error): ProbeResult => ({ error: (error as Error)?.message })
        );
      probes.set(url, result);
    }
    return result;
  };
  const prune = (url: string): void => {
    for (const bridge of bridges) {
      for (const urls of [bridge.inboxRPC, bridge.outboxRPC, bridge.routerRPC]) {
        if (!Array.isArray(urls)) continue;
        for (let index = urls.indexOf(url); index !== -1; index = urls.indexOf(url)) urls.splice(index, 1);
      }
    }
  };

  for (const [position, chainId] of chainIds.entries()) {
    const bridge = bridges[position];
    const { rpcEnvVars } = bridge;

    const lists: Array<Omit<Endpoint, "provider">> = [
      { role: "outbox", envVar: rpcEnvVars.outbox, urls: bridge.outboxRPC, expectedChainId: chainId },
      { role: "inbox", envVar: rpcEnvVars.inbox, urls: bridge.inboxRPC, expectedChainId: bridge.inboxChainId },
    ];
    if (rpcEnvVars.router && bridge.routerRPC) {
      lists.push({
        role: "router",
        envVar: rpcEnvVars.router,
        urls: bridge.routerRPC,
        expectedChainId: bridge.routerChainId,
      });
    }

    const verified: Endpoint[] = [];
    for (const list of lists) {
      if (await checkEndpointChains(list, chainId, probe, prune, problems, warnings, emitter)) {
        verified.push({ ...list, provider: createProvider(list.urls, list.expectedChainId) });
      }
    }
    await checkDeployments(verified, bridge, networks, chainId, problems, readOutboxHashClaim);
    await checkFunding(
      verified,
      bridge,
      networks,
      chainId,
      signerAddress,
      problems,
      warnings,
      readDepositTokenBalance,
      emitter
    );
  }
};

/** What one URL answered to `eth_chainId`, or why it did not answer. */
type ProbeResult = { chainId: number } | { error: string };

/**
 * Confirm every URL of an RPC list answers as the chain the list is configured
 * for, each probed on its own. A fallback provider answers from whichever
 * endpoint is up, so probing through it would vouch only for that one; the
 * others would be trusted unseen the first time the bot fails over to them.
 *
 * A URL that answers as another chain is fatal: it would give confident wrong
 * answers. A URL that does not answer at all, the first one included, is a
 * warning plus an `ALERT` (`rpc_url_unreachable`) and is removed in place from
 * every RPC list of the configured routes, so the bot never fails over to an
 * endpoint nobody vouched for; it comes back only after a restart. A list left
 * with no URL that answered as the expected chain is fatal.
 *
 * @returns true when the list still holds at least one URL and every one of them
 * answered with the expected chain id
 */
const checkEndpointChains = async (
  list: Omit<Endpoint, "provider">,
  chainId: number,
  probe: (url: string, expectedChainId: number) => Promise<ProbeResult>,
  prune: (url: string) => void,
  problems: string[],
  warnings: string[],
  emitter: EventEmitter
): Promise<boolean> => {
  let allVerified = true;
  // A copy: pruning shortens the list being walked.
  for (const [index, url] of [...list.urls].entries()) {
    const name = `${list.envVar} endpoint ${index + 1} (${describeUrl(url)}, chain ${chainId} ${list.role})`;
    const result = await probe(url, list.expectedChainId);
    if ("error" in result) {
      prune(url);
      warnings.push(
        `${name} is unreachable and is dropped from ${list.envVar} until the validator restarts: ${result.error}`
      );
      const payload: AlertPayload = {
        level: "warn",
        code: "rpc_url_unreachable",
        chainId,
        details: { envVar: list.envVar, role: list.role, endpoint: index + 1, url: describeUrl(url) },
      };
      emitter.emit(BotEvents.ALERT, payload);
      continue;
    }
    if (result.chainId !== list.expectedChainId) {
      problems.push(`${name} answers as chain ${result.chainId}, expected ${list.expectedChainId}.`);
      allVerified = false;
    }
  }
  if (list.urls.length === 0) {
    problems.push(
      `${list.envVar} has no reachable endpoint for chain ${chainId} ${list.role} (expected chain ${list.expectedChainId}).`
    );
    return false;
  }
  return allVerified;
};

/**
 * Confirm the contracts we are about to call are the ones we think. The outbox
 * must hash a synthetic claim to exactly what `hashClaim` in `claim.ts` computes:
 * that one call fails on a wrong address (no code, or another contract), a wrong
 * ABI and any drift in the packed encoding the bot relies on to match claims.
 * The inbox and router keep the plain code check.
 */
const checkDeployments = async (
  endpoints: Endpoint[],
  bridge: any,
  networks: Network[],
  chainId: number,
  problems: string[],
  readOutboxHashClaim: ReadOutboxHashClaim
): Promise<void> => {
  const roleToContract: Record<string, string> = { inbox: "veaInbox", outbox: "veaOutbox", router: "veaRouter" };
  const expectedHash = hashClaim(PARITY_PROBE_CLAIM as any);
  for (const network of networks) {
    const route = bridge.routeConfig[network];
    if (!route) {
      problems.push(`Chain ${chainId} has no ${network} deployment, but NETWORKS asks for it.`);
      continue;
    }
    for (const endpoint of endpoints) {
      const contract = route[roleToContract[endpoint.role]];
      if (!contract?.address) continue;
      const where = `Chain ${chainId} ${network} ${endpoint.role} at ${contract.address}`;
      if (endpoint.role === "outbox") {
        try {
          const reported = await readOutboxHashClaim(
            contract.address,
            contract.abi,
            PARITY_PROBE_CLAIM,
            endpoint.provider
          );
          if (String(reported).toLowerCase() !== expectedHash.toLowerCase()) {
            problems.push(
              `${where} failed the hashClaim parity check: the contract returned ${reported}, the validator computes ${expectedHash}. Wrong address, ABI or chain.`
            );
          }
        } catch (error) {
          problems.push(`${where} failed the hashClaim parity check: ${(error as Error)?.message}`);
        }
        continue;
      }
      try {
        const code = await endpoint.provider.getCode(contract.address);
        if (!code || code === "0x") {
          problems.push(`Chain ${chainId} ${network} ${endpoint.role} has no contract code at ${contract.address}.`);
        }
      } catch (error) {
        problems.push(`${where} code check failed: ${(error as Error)?.message}`);
      }
    }
  }
};

/**
 * Report what the signer can pay with. Nothing here is fatal: every finding is
 * about one route's funds, and a startup failure would stop every route.
 */
const checkFunding = async (
  endpoints: Endpoint[],
  bridge: any,
  networks: Network[],
  chainId: number,
  signerAddress: string,
  problems: string[],
  warnings: string[],
  readDepositTokenBalance: PreflightParams["readDepositTokenBalance"],
  emitter: EventEmitter
): Promise<void> => {
  const deposits = networks.map((network) => bridge.routeConfig[network]?.deposit).filter(Boolean) as bigint[];
  const largestDeposit = deposits.length > 0 ? deposits.reduce((a, b) => (a > b ? a : b)) : 0n;
  const alert = (code: string, details: Record<string, unknown>) => {
    const payload: AlertPayload = { level: "warn", code, chainId, details };
    emitter.emit(BotEvents.ALERT, payload);
  };

  for (const endpoint of endpoints) {
    // The router chain counts too: on chain 10200 the dispute ticket is executed there from our signer.
    let balance: bigint;
    try {
      balance = await endpoint.provider.getBalance(signerAddress);
    } catch (error) {
      warnings.push(`Chain ${chainId} ${endpoint.role} balance check failed: ${(error as Error)?.message}`);
      alert("funding_check_failed", { role: endpoint.role, check: "native_balance" });
      continue;
    }
    if (balance === 0n) {
      // A signer with no native balance cannot send any transaction: fatal, as the operator decided
      // (the route stays named so the funding gap is clear).
      problems.push(
        `Signer ${signerAddress} has no native balance on chain ${chainId} ${endpoint.role} (chain ${endpoint.expectedChainId}); route ${chainId} cannot send transactions there. Fund it before starting.`
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
    warnings.push(`Chain ${chainId} deposit token check failed: ${(error as Error)?.message}`);
    alert("funding_check_failed", { role: "outbox", check: "deposit_token" });
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

/**
 * `HEARTBEAT_URL` is optional, but when set it must be https: the heartbeat
 * carries the monitor's token in its URL. The value itself is never echoed.
 */
const validateHeartbeatUrl = (env: Record<string, string | undefined>, problems: string[]): void => {
  const heartbeatUrl = env.HEARTBEAT_URL?.trim();
  if (!heartbeatUrl) return;
  if (!isHttpsUrl(heartbeatUrl)) {
    problems.push(`HEARTBEAT_URL must be an https URL when set; got ${describeUrl(heartbeatUrl)}.`);
  }
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
      for (const [index, url] of urls.entries()) {
        if (!isHttpUrl(url)) {
          problems.push(`${envVar} endpoint ${index + 1} (${describeUrl(url)}) is not an http(s) URL.`);
        }
      }
    }

    if (bridge.depositTokenEnvVar && !bridge.depositToken) {
      problems.push(`${bridge.depositTokenEnvVar} is not set but chain ${chainId} takes its deposit in that token.`);
    }
  }
};

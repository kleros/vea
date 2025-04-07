import { JsonRpcProvider } from "@ethersproject/providers";
import { getBridgeConfig, Network } from "./consts/bridgeRoutes";
import { getVeaInbox, getVeaOutbox } from "./utils/ethers";
import { getBlockFromEpoch, setEpochRange } from "./utils/epochHandler";
import { getClaimValidator, getClaimer } from "./utils/ethers";
import { defaultEmitter } from "./utils/emitter";
import { BotEvents } from "./utils/botEvents";
import { initialize as initializeLogger } from "./utils/logger";
import { ShutdownSignal } from "./utils/shutdown";
import { getBotPath, BotPaths, getNetworkConfig, NetworkConfig } from "./utils/botConfig";
import { getClaim } from "./utils/claim";
import { MissingEnvError } from "./utils/errors";
import { CheckAndClaimParams } from "./ArbToEth/claimer";
import { ChallengeAndResolveClaimParams } from "./ArbToEth/validator";

const RPC_BLOCK_LIMIT = 500; // RPC_BLOCK_LIMIT is the limit of blocks that can be queried at once

/**
 * @file This file contains the logic for watching bridge and validating/resolving for claims.
 *
 * @param shutDownSignal - The signal to shut down the watcher
 * @param emitter - The emitter to emit events
 *
 */

export const watch = async (
  shutDownSignal: ShutdownSignal = new ShutdownSignal(),
  emitter: typeof defaultEmitter = defaultEmitter
) => {
  initializeLogger(emitter);
  const privKey = process.env.PRIVATE_KEY;
  if (!privKey) throw new MissingEnvError("PRIVATE_KEY");
  const cliCommand = process.argv;
  const path = getBotPath({ cliCommand });
  const networkConfigs = getNetworkConfig();
  emitter.emit(BotEvents.STARTED, path, networkConfigs[0].networks);
  const transactionHandlers: { [epoch: number]: any } = {};
  const toWatch: { [key: string]: number[] } = {};
  while (!shutDownSignal.getIsShutdownSignal()) {
    for (const networkConfig of networkConfigs) {
      await processNetwork(path, networkConfig, transactionHandlers, toWatch, emitter);
    }
    await wait(1000 * 10);
  }
};

async function processNetwork(
  path: number,
  networkConfig: NetworkConfig,
  transactionHandlers: { [epoch: number]: any },
  toWatch: { [key: string]: number[] },
  emitter: typeof defaultEmitter
): Promise<void> {
  const { chainId, networks } = networkConfig;
  const { routeConfig, inboxRPC, outboxRPC } = getBridgeConfig(chainId);
  for (const network of networks) {
    emitter.emit(BotEvents.WATCHING, chainId, network);
    const networkKey = `${chainId}_${network}`;
    if (!toWatch[networkKey]) {
      toWatch[networkKey] = [];
    }

    const veaOutboxProvider = new JsonRpcProvider(outboxRPC);
    let veaOutboxLatestBlock = await veaOutboxProvider.getBlock("latest");

    // If the watcher has already started, only check the latest epoch
    if (network == Network.DEVNET) {
      toWatch[networkKey] = [Math.floor(veaOutboxLatestBlock.timestamp / routeConfig[network].epochPeriod)];
    } else if (toWatch[networkKey].length == 0) {
      const epochRange = setEpochRange({
        chainId,
        currentTimestamp: veaOutboxLatestBlock.timestamp,
        epochPeriod: routeConfig[network].epochPeriod,
      });
      toWatch[networkKey] = epochRange;
    }

    await processEpochsForNetwork(
      chainId,
      path,
      networkKey,
      network,
      routeConfig,
      inboxRPC,
      outboxRPC,
      toWatch,
      transactionHandlers,
      emitter
    );
    const currentLatestBlock = await veaOutboxProvider.getBlock("latest");
    const currentLatestEpoch = Math.floor(currentLatestBlock.timestamp / routeConfig[network].epochPeriod);
    const toWatchEpochs = toWatch[networkKey];
    const lastEpochInToWatch = toWatchEpochs[toWatchEpochs.length - 1];
    if (currentLatestEpoch > lastEpochInToWatch) {
      toWatch[networkKey].push(currentLatestEpoch);
    }
  }
}

async function processEpochsForNetwork(
  chainId: number,
  path: number,
  networkKey: string,
  network: Network,
  routeConfig: any,
  inboxRPC: string,
  outboxRPC: string,
  toWatch: { [key: string]: number[] },
  transactionHandlers: { [epoch: number]: any },
  emitter: typeof defaultEmitter
) {
  const privKey = process.env.PRIVATE_KEY;
  const veaInbox = getVeaInbox(routeConfig[network].veaInbox.address, privKey, inboxRPC, chainId, network);
  const veaOutbox = getVeaOutbox(routeConfig[network].veaOutbox.address, privKey, outboxRPC, chainId, network);
  const veaInboxProvider = new JsonRpcProvider(inboxRPC);
  const veaOutboxProvider = new JsonRpcProvider(outboxRPC);
  let i = toWatch[networkKey].length - 1;
  const latestEpoch = toWatch[networkKey][i];
  while (i >= 0) {
    const epoch = toWatch[networkKey][i];
    const epochBlock = await getBlockFromEpoch(epoch, routeConfig[network].epochPeriod, veaOutboxProvider);
    const latestBlock = await veaOutboxProvider.getBlock("latest");
    let toBlock: number | string = "latest";
    if (latestBlock.number - epochBlock > RPC_BLOCK_LIMIT) {
      toBlock = epochBlock + RPC_BLOCK_LIMIT;
    }

    const claim = await getClaim({ veaOutbox, veaOutboxProvider, epoch, fromBlock: epochBlock, toBlock });

    const checkAndChallengeResolve = getClaimValidator(chainId, network);
    const checkAndClaim = getClaimer(chainId, network);
    let updatedTransactions;
    if (path > BotPaths.CLAIMER && claim != null) {
      const checkAndChallengeResolveDeps: ChallengeAndResolveClaimParams = {
        claim,
        epoch,
        epochPeriod: routeConfig[network].epochPeriod,
        veaInbox,
        veaInboxProvider,
        veaOutboxProvider,
        veaOutbox,
        transactionHandler: transactionHandlers[epoch],
        emitter,
      };
      updatedTransactions = await checkAndChallengeResolve(checkAndChallengeResolveDeps);
    }
    if (path == BotPaths.CLAIMER || path == BotPaths.BOTH) {
      const checkAndClaimParams: CheckAndClaimParams = {
        network,
        chainId,
        claim,
        epoch,
        epochPeriod: routeConfig[network].epochPeriod,
        veaInbox,
        veaInboxProvider,
        veaOutboxProvider,
        veaOutbox,
        transactionHandler: transactionHandlers[epoch],
        emitter,
      };
      updatedTransactions = await checkAndClaim(checkAndClaimParams);
    }

    if (updatedTransactions) {
      transactionHandlers[epoch] = updatedTransactions;
    } else if (epoch != latestEpoch) {
      delete transactionHandlers[epoch];
      toWatch[networkKey].splice(i, 1);
    }
    i--;
  }
}

const wait = (ms: number): Promise<void> => new Promise((resolve: () => void) => setTimeout(resolve, ms));

if (require.main === module) {
  const shutDownSignal = new ShutdownSignal(false);
  watch(shutDownSignal);
}

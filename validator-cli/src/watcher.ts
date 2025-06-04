import { JsonRpcProvider } from "@ethersproject/providers";
import { getBridgeConfig, Network } from "./consts/bridgeRoutes";
import { getTransactionHandler, getVeaInbox, getVeaOutbox } from "./utils/ethers";
import { getBlockFromEpoch, setEpochRange } from "./utils/epochHandler";
import { defaultEmitter } from "./utils/emitter";
import { BotEvents } from "./utils/botEvents";
import { initialize as initializeLogger } from "./utils/logger";
import { ShutdownSignal } from "./utils/shutdown";
import { getBotPath, BotPaths, getNetworkConfig, NetworkConfig } from "./utils/botConfig";
import { getClaim } from "./utils/claim";
import { MissingEnvError } from "./utils/errors";
import { CheckAndClaimParams, checkAndClaim } from "./helpers/claimer";
import { ChallengeAndResolveClaimParams, challengeAndResolveClaim } from "./helpers/validator";
import { saveSnapshot, SaveSnapshotParams } from "./helpers/snapshot";

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
  const { path, toSaveSnapshot } = getBotPath({ cliCommand });
  const networkConfigs = getNetworkConfig();
  emitter.emit(BotEvents.STARTED, path, networkConfigs[0].networks);
  const transactionHandlers: { [epoch: number]: any } = {};
  const toWatch: { [key: string]: { count: number; epochs: number[] } } = {};
  while (!shutDownSignal.getIsShutdownSignal()) {
    for (const networkConfig of networkConfigs) {
      await processNetwork(path, toSaveSnapshot, networkConfig, transactionHandlers, toWatch, emitter);
    }
    await wait(1000 * 10);
  }
};

async function processNetwork(
  path: number,
  toSaveSnapshot: boolean,
  networkConfig: NetworkConfig,
  transactionHandlers: { [epoch: number]: any },
  toWatch: { [key: string]: { count: number; epochs: number[] } },
  emitter: typeof defaultEmitter
): Promise<void> {
  const { chainId, networks } = networkConfig;
  const { routeConfig, inboxRPC, outboxRPC } = getBridgeConfig(chainId);
  for (const network of networks) {
    emitter.emit(BotEvents.WATCHING, chainId, network);
    const networkKey = `${chainId}_${network}`;
    if (!toWatch[networkKey]) {
      toWatch[networkKey] = { count: -1, epochs: [] };
    }
    const veaOutboxProvider = new JsonRpcProvider(outboxRPC);
    let veaOutboxLatestBlock = await veaOutboxProvider.getBlock("latest");

    // If the watcher has already started, only check the latest epoch
    if (network == Network.DEVNET) {
      toWatch[networkKey].epochs = [Math.floor(veaOutboxLatestBlock.timestamp / routeConfig[network].epochPeriod)];
    } else if (toWatch[networkKey].epochs.length == 0) {
      const epochRange = setEpochRange({
        chainId,
        currentTimestamp: veaOutboxLatestBlock.timestamp,
        epochPeriod: routeConfig[network].epochPeriod,
      });
      toWatch[networkKey].epochs = epochRange;
    }

    await processEpochsForNetwork({
      chainId,
      path,
      toSaveSnapshot,
      networkKey,
      network,
      routeConfig,
      inboxRPC,
      outboxRPC,
      toWatch,
      transactionHandlers,
      emitter,
    });
    const currentLatestBlock = await veaOutboxProvider.getBlock("latest");
    const currentClaimableEpoch = Math.floor(currentLatestBlock.timestamp / routeConfig[network].epochPeriod) - 1;

    const toWatchEpochs = toWatch[networkKey];
    const lastEpochInToWatch = toWatchEpochs[toWatchEpochs.epochs.length - 1];
    if (currentClaimableEpoch > lastEpochInToWatch) {
      toWatch[networkKey].epochs.push(currentClaimableEpoch);
    }
  }
}

interface ProcessEpochParams {
  chainId: number;
  path: number;
  toSaveSnapshot: boolean;
  networkKey: string;
  network: Network;
  routeConfig: any;
  inboxRPC: string;
  outboxRPC: string;
  toWatch: { [key: string]: { count: number; epochs: number[] } };
  transactionHandlers: { [epoch: number]: any };
  emitter: typeof defaultEmitter;
}
async function processEpochsForNetwork({
  chainId,
  path,
  toSaveSnapshot,
  networkKey,
  network,
  routeConfig,
  inboxRPC,
  outboxRPC,
  toWatch,
  transactionHandlers,
  emitter,
}: ProcessEpochParams) {
  const privKey = process.env.PRIVATE_KEY;
  const veaInbox = getVeaInbox(routeConfig[network].veaInbox.address, privKey, inboxRPC, chainId, network);
  const veaOutbox = getVeaOutbox(routeConfig[network].veaOutbox.address, privKey, outboxRPC, chainId, network);
  const veaInboxProvider = new JsonRpcProvider(inboxRPC);
  const veaOutboxProvider = new JsonRpcProvider(outboxRPC);
  let i = toWatch[networkKey].epochs.length - 1;
  const latestEpoch = toWatch[networkKey].epochs[i];
  const currentEpoch = Math.floor(Date.now() / (1000 * routeConfig[network].epochPeriod));
  // Checks and saves the snapshot if needed
  if (toSaveSnapshot) {
    const TransactionHandler = getTransactionHandler(chainId, network) as any;
    const transactionHandler =
      transactionHandlers[currentEpoch] ||
      new TransactionHandler({
        network,
        epoch: currentEpoch,
        veaInbox,
        veaOutbox,
        veaInboxProvider,
        veaOutboxProvider,
        emitter,
      });
    const { updatedTransactionHandler, latestCount } = await saveSnapshot({
      chainId,
      veaInbox,
      network,
      epochPeriod: routeConfig[network].epochPeriod,
      count: toWatch[networkKey].count,
      transactionHandler,
    } as SaveSnapshotParams);
    const count = toWatch[networkKey].count;
    if (count == -1 || count != latestCount) {
      transactionHandlers[currentEpoch] = updatedTransactionHandler;
      toWatch[networkKey].count = latestCount;
    }
  }

  while (i >= 0) {
    const epoch = toWatch[networkKey].epochs[i];
    const epochBlock = await getBlockFromEpoch(epoch, routeConfig[network].epochPeriod, veaOutboxProvider);
    const latestBlock = await veaOutboxProvider.getBlock("latest");
    let toBlock: number | string = "latest";
    if (latestBlock.number - epochBlock > RPC_BLOCK_LIMIT) {
      toBlock = epochBlock + RPC_BLOCK_LIMIT;
    }

    const claim = await getClaim({ chainId, veaOutbox, veaOutboxProvider, epoch, fromBlock: epochBlock, toBlock });

    let updatedTransactions;

    if (path > BotPaths.CLAIMER && claim != null) {
      const checkAndChallengeResolveDeps: ChallengeAndResolveClaimParams = {
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
      updatedTransactions = await challengeAndResolveClaim(checkAndChallengeResolveDeps);
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
      toWatch[networkKey].epochs.splice(i, 1);
    }
    i--;
  }
}

const wait = (ms: number): Promise<void> => new Promise((resolve: () => void) => setTimeout(resolve, ms));

if (require.main === module) {
  const shutDownSignal = new ShutdownSignal(false);
  watch(shutDownSignal);
}

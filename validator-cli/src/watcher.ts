import { JsonRpcProvider } from "@ethersproject/providers";
import { getBridgeConfig, Bridge, Network } from "./consts/bridgeRoutes";
import { getVeaInbox, getVeaOutbox, getTransactionHandler } from "./utils/ethers";
import { getBlockFromEpoch, setEpochRange } from "./utils/epochHandler";
import { getClaimValidator, getClaimer } from "./utils/ethers";
import { defaultEmitter } from "./utils/emitter";
import { BotEvents } from "./utils/botEvents";
import { initialize as initializeLogger } from "./utils/logger";
import { ShutdownSignal } from "./utils/shutdown";
import { getBotPath, BotPaths, getNetworkConfig } from "./utils/botConfig";
import { getClaim } from "./utils/claim";

/**
 * @file This file contains the logic for watching a bridge and validating/resolving for claims.
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
  const cliCommand = process.argv;
  const path = getBotPath({ cliCommand });
  const networkConfigs = getNetworkConfig();
  emitter.emit(BotEvents.STARTED, path, networkConfigs[0].networks);
  const transactionHandlers: { [epoch: number]: any } = {};
  const isWatched: { chainId: number; network: string }[] = [];
  while (!shutDownSignal.getIsShutdownSignal()) {
    for (const networkConfig of networkConfigs) {
      const { chainId, networks } = networkConfig;
      const { routeConfig, inboxRPC, outboxRPC } = getBridgeConfig(chainId);
      for (const network of networks) {
        emitter.emit(BotEvents.WATCHING, chainId, network);
        const veaInbox = getVeaInbox(
          routeConfig[network].veaInbox.address,
          process.env.PRIVATE_KEY,
          inboxRPC,
          chainId,
          network
        );
        const veaOutbox = getVeaOutbox(
          routeConfig[network].veaOutbox.address,
          process.env.PRIVATE_KEY,
          outboxRPC,
          chainId,
          network
        );
        const veaInboxProvider = new JsonRpcProvider(inboxRPC);
        const veaOutboxProvider = new JsonRpcProvider(outboxRPC);
        let veaOutboxLatestBlock = await veaOutboxProvider.getBlock("latest");
        var epochRange = setEpochRange({
          chainId,
          currentTimestamp: veaOutboxLatestBlock.timestamp,
          epochPeriod: routeConfig[network].epochPeriod,
        });

        // If the watcher has already started, only check the latest epoch
        console.log(isWatched);
        if (
          isWatched.find((watcher) => watcher.chainId == chainId && watcher.network == network) != null ||
          network == Network.DEVNET
        ) {
          if (network == Network.DEVNET) {
            epochRange = [Math.floor(veaOutboxLatestBlock.timestamp / routeConfig[network].epochPeriod)];
          } else {
            epochRange = [epochRange[epochRange.length - 1]];
          }
        }
        let i = epochRange.length - 1;
        while (i >= 0) {
          const epoch = epochRange[i];
          let latestEpoch = epochRange[epochRange.length - 1];
          const epochBlock = await getBlockFromEpoch(epoch, routeConfig[network].epochPeriod, veaOutboxProvider);
          const claim = await getClaim(veaOutbox, veaOutboxProvider, epoch, epochBlock, "latest");
          const checkAndChallengeResolveDeps = {
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

          const checkAndChallengeResolve = getClaimValidator(chainId, network);
          const checkAndClaim = getClaimer(chainId, network);
          let updatedTransactions;
          if (path > BotPaths.CLAIMER && claim != null) {
            updatedTransactions = await checkAndChallengeResolve(checkAndChallengeResolveDeps);
          }
          if (path == BotPaths.CLAIMER || path == BotPaths.BOTH) {
            updatedTransactions = await checkAndClaim(checkAndChallengeResolveDeps);
          }

          if (updatedTransactions) {
            transactionHandlers[epoch] = updatedTransactions;
          } else if (epoch != latestEpoch) {
            delete transactionHandlers[epoch];
            epochRange.splice(i, 1);
          }
          i--;
        }
        if (!isWatched.find((watcher) => watcher.chainId == chainId && watcher.network == network)) {
          isWatched.push({ chainId, network });
        }
      }
    }
    await wait(1000 * 10);
  }
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

if (require.main === module) {
  const shutDownSignal = new ShutdownSignal(false);
  watch(shutDownSignal);
}

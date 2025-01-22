import { JsonRpcProvider } from "@ethersproject/providers";
import { getBridgeConfig, Bridge } from "./consts/bridgeRoutes";
import { getVeaInbox, getVeaOutbox, getTransactionHandler } from "./utils/ethers";
import { setEpochRange, getLatestChallengeableEpoch } from "./utils/epochHandler";
import { getClaimValidator, getClaimer } from "./utils/ethers";
import { defaultEmitter } from "./utils/emitter";
import { BotEvents } from "./utils/botEvents";
import { initialize as initializeLogger } from "./utils/logger";
import { ShutdownSignal } from "./utils/shutdown";
import { getBotPath, BotPaths } from "./utils/cli";

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
  const path = getBotPath();
  const chainId = Number(process.env.VEAOUTBOX_CHAIN_ID);
  emitter.emit(BotEvents.STARTED, chainId, path);

  const veaBridge: Bridge = getBridgeConfig(chainId);
  const veaInbox = getVeaInbox(veaBridge.inboxAddress, process.env.PRIVATE_KEY, veaBridge.inboxRPC, chainId);
  const veaOutbox = getVeaOutbox(veaBridge.outboxAddress, process.env.PRIVATE_KEY, veaBridge.outboxRPC, chainId);
  const veaInboxProvider = new JsonRpcProvider(veaBridge.inboxRPC);
  const veaOutboxProvider = new JsonRpcProvider(veaBridge.outboxRPC);
  const checkAndChallengeResolve = getClaimValidator(chainId);
  const checkAndClaim = getClaimer(chainId);
  const TransactionHandler = getTransactionHandler(chainId);

  let veaOutboxLatestBlock = await veaOutboxProvider.getBlock("latest");
  const transactionHandlers: { [epoch: number]: InstanceType<typeof TransactionHandler> } = {};
  const epochRange = setEpochRange(veaOutboxLatestBlock.timestamp, chainId);

  let latestEpoch = getLatestChallengeableEpoch(chainId);
  while (!shutDownSignal.getIsShutdownSignal()) {
    let i = 0;
    while (i < epochRange.length) {
      const epoch = epochRange[i];
      emitter.emit(BotEvents.CHECKING, epoch);
      const checkAndChallengeResolveDeps = {
        epoch,
        epochPeriod: veaBridge.epochPeriod,
        veaInbox,
        veaInboxProvider,
        veaOutboxProvider,
        veaOutbox,
        transactionHandler: transactionHandlers[epoch],
        emitter,
      };
      let updatedTransactions;
      if (path > BotPaths.CLAIMER) {
        updatedTransactions = await checkAndChallengeResolve(checkAndChallengeResolveDeps);
      }
      if (path == BotPaths.CLAIMER || path == BotPaths.BOTH) {
        updatedTransactions = await checkAndClaim(checkAndChallengeResolveDeps);
      }

      if (updatedTransactions) {
        transactionHandlers[epoch] = updatedTransactions;
      } else {
        delete transactionHandlers[epoch];
        epochRange.splice(i, 1);
        continue;
      }
      i++;
    }
    const newEpoch = getLatestChallengeableEpoch(chainId);
    if (newEpoch > latestEpoch) {
      epochRange.push(newEpoch);
      latestEpoch = newEpoch;
    } else {
      emitter.emit(BotEvents.WAITING, latestEpoch);
    }
    await wait(1000 * 10);
  }
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

if (require.main === module) {
  const shutDownSignal = new ShutdownSignal(false);
  watch(shutDownSignal);
}

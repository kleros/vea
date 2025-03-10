import { JsonRpcProvider } from "@ethersproject/providers";
import { getBridgeConfig, Bridge } from "./consts/bridgeRoutes";
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
  for (const networkConfig of networkConfigs) {
    const { chainId, networks } = networkConfig;
    const { veaContracts, inboxRPC, outboxRPC } = getBridgeConfig(chainId);
    for (const network of networks) {
      emitter.emit(BotEvents.WATCHING, chainId, network);
      const veaInbox = getVeaInbox(veaContracts[network].veaInbox.address, process.env.PRIVATE_KEY, inboxRPC, chainId);
      const veaOutbox = getVeaOutbox(
        veaContracts[network].veaOutbox.address,
        process.env.PRIVATE_KEY,
        outboxRPC,
        chainId
      );
      const veaInboxProvider = new JsonRpcProvider(inboxRPC);
      const veaOutboxProvider = new JsonRpcProvider(outboxRPC);

      const checkAndChallengeResolve = getClaimValidator(chainId, network);
      const checkAndClaim = getClaimer(chainId, network);
    }
  }
  return;
  // const chainId = Number(process.env.VEAOUTBOX_CHAINS);

  // emitter.emit(BotEvents.STARTED, chainId, path);
  //
  // const veaInbox = getVeaInbox(veaBridge.inboxAddress, process.env.PRIVATE_KEY, veaBridge.inboxRPC, chainId);
  // const veaOutbox = getVeaOutbox(veaBridge.outboxAddress, process.env.PRIVATE_KEY, veaBridge.outboxRPC, chainId);
  // const veaInboxProvider = new JsonRpcProvider(veaBridge.inboxRPC);
  // const veaOutboxProvider = new JsonRpcProvider(veaBridge.outboxRPC);
  // const checkAndChallengeResolve = getClaimValidator(chainId);
  // const checkAndClaim = getClaimer(chainId);
  // const TransactionHandler = getTransactionHandler(chainId);

  // let veaOutboxLatestBlock = await veaOutboxProvider.getBlock("latest");
  // const transactionHandlers: { [epoch: number]: InstanceType<typeof TransactionHandler> } = {};
  // const epochRange = setEpochRange(veaOutboxLatestBlock.timestamp, chainId);
  // let latestEpoch = epochRange[epochRange.length - 1];
  // while (!shutDownSignal.getIsShutdownSignal()) {
  //   let i = 0;
  //   while (i < epochRange.length) {
  //     const epoch = epochRange[i];
  //     emitter.emit(BotEvents.CHECKING, epoch);
  //     const epochBlock = await getBlockFromEpoch(epoch, veaBridge.epochPeriod, veaOutboxProvider);
  //     const claim = await getClaim(veaOutbox, veaOutboxProvider, epoch, epochBlock, "latest");
  //     const checkAndChallengeResolveDeps = {
  //       claim,
  //       epoch,
  //       epochPeriod: veaBridge.epochPeriod,
  //       veaInbox,
  //       veaInboxProvider,
  //       veaOutboxProvider,
  //       veaOutbox,
  //       transactionHandler: transactionHandlers[epoch],
  //       emitter,
  //     };
  //     let updatedTransactions;
  //     if (path > BotPaths.CLAIMER && claim != null) {
  //       updatedTransactions = await checkAndChallengeResolve(checkAndChallengeResolveDeps);
  //     }
  //     if (path == BotPaths.CLAIMER || path == BotPaths.BOTH) {
  //       updatedTransactions = await checkAndClaim(checkAndChallengeResolveDeps);
  //     }

  //     if (updatedTransactions) {
  //       transactionHandlers[epoch] = updatedTransactions;
  //     } else if (epoch != latestEpoch) {
  //       delete transactionHandlers[epoch];
  //       epochRange.splice(i, 1);
  //       continue;
  //     }
  //     i++;
  //   }
  //   const newVerifiableEpoch = Math.floor(Date.now() / (1000 * veaBridge.epochPeriod)) - 1;
  //   if (newVerifiableEpoch > latestEpoch) {
  //     epochRange.push(newVerifiableEpoch);
  //     latestEpoch = newVerifiableEpoch;
  //   } else {
  //     emitter.emit(BotEvents.WAITING, latestEpoch);
  //   }
  //   await wait(1000 * 10);
  // }
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

if (require.main === module) {
  const shutDownSignal = new ShutdownSignal(false);
  watch(shutDownSignal);
}

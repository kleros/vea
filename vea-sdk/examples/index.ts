import { Wallet } from "@ethersproject/wallet";
import VeaSdk from "../src/index";
import env from "../src/utils/env";

async function main() {
  // Optional logger configuration
  const loggerOptions = {
    transportTargetOptions: {
      target: "@logtail/pino",
      options: { sourceToken: env.require("LOGTAIL_TOKEN") },
      level: env.optional("LOG_LEVEL", "info"),
    },
  };

  // Create the Vea client
  const vea = VeaSdk.ClientFactory.arbitrumGoerliToChiadoDevnet(
    env.require("RPC_ARB_GOERLI"),
    env.require("RPC_CHIADO"),
    loggerOptions
  );

  // Get the current state root
  const logger = vea.logger;
  logger.info(`stateRoot=${await vea.outbox.stateRoot()}`);

  // Get a message info
  const messageId = 1;
  const messageInfo = await vea.getMessageInfo(messageId);

  // Relay the message
  const privateKey = env.require("PRIVATE_KEY");
  const wallet = new Wallet(privateKey, vea.outboxProvider);
  await vea.relay(messageInfo, wallet);
}

main().catch((e) => {
  VeaSdk.ClientFactory.logger.error(e);
  process.exit(1);
});

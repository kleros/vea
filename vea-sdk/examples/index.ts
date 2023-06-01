import { Wallet } from "@ethersproject/wallet";
import VeaSdk from "../src/index";
import envVar from "../src/utils/envVar";

async function main() {
  // Create the Vea client
  const vea = VeaSdk.ClientFactory.arbitrumGoerliToChiadoDevnet(envVar("RPC_ARB_GOERLI"), envVar("RPC_CHIADO"));

  // Get the current state root
  console.log(`stateRoot=${await vea.outbox.stateRoot()}`);

  // Get a message info
  const messageId = 1;
  const messageInfo = await vea.getMessageInfo(messageId);

  // Relay the message
  const privateKey = envVar("PRIVATE_KEY");
  const wallet = new Wallet(privateKey, vea.outboxProvider);
  await vea.relay(messageInfo, wallet);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

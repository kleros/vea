import { getProof, getMessageDataToRelay } from "./utils/proof";
import { relay, relayBatch, relayAllFrom } from "./utils/relay";
import watch from "./arbToEth/watcher";
import { getVeaOutboxArbToEthProvider, getVeaOutboxArbToEth } from "./utils/ethers";
import { JsonRpcProvider } from "@ethersproject/providers";

require("dotenv").config();

(async () => {
  //await watch();
  // information to relay a single message
  // get the current proof for nonce zero
  //console.log(await getProof(2));
  // get the message data for nonce zero
  //console.log(await getMessageDataToRelay(2));
  // relay from nonce = 1, for 2 iterations eg. relay nonce = 1, nonce = 2
  /*
    const l1provider = new JsonRpcProvider(process.env.RPC_VEAOUTBOX);

    
    const proof = await getProof(2);
    const [to, data] = await getMessageDataToRelay(2);

    const veaOutbox = getVeaOutboxArbToEthProvider(
        process.env.VEAOUTBOX_ADDRESS,
        process.env.PRIVATE_KEY,
        l1provider
      );

    await veaOutbox.sendMessage(
      proof,
      2,
      to,
      data
    )*/
  //console.log(await relayBatch(2,1));
  // relays the most recent 1000 messages sent from address 0x46EA1973c50CdF35185fCD54D733A158a4A2ff20
  // starts from nonce = 0, returns the nonce of the next batch of messages to relay (if more than 1000)
  //console.log(await relayAllFrom(0, "0x46EA1973c50CdF35185fCD54D733A158a4A2ff20"))
})();

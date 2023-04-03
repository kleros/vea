const Web3 = require("web3");
import { getVeaInbox, getVeaOutbox } from "./ethers";

require("dotenv").config();

(async () => {
  const web3_veaInbox = getVeaInbox(process.env.VEAINBOX_ADDRESS, process.env.PRIVATE_KEY, process.env.RPC_VEAINBOX);
  const web3_veaOutbox = getVeaOutbox(
    process.env.VEAOUTBOX_ADDRESS,
    process.env.PRIVATE_KEY,
    process.env.RPC_VEAOUTBOX
  );

  const deposit = await web3_veaOutbox.deposit();
  const challengePeriod = (await web3_veaOutbox.challengePeriod()).toNumber();
  const epochPeriod = (await web3_veaOutbox.epochPeriod()).toNumber();

  const currentTS = Math.floor(Date.now() / 1000);
  const currentEpoch = Math.floor(currentTS / epochPeriod);
  const challengableEpochStart = Math.floor((currentTS - challengePeriod) / epochPeriod);

  console.log(`Current Timestamp: ${currentTS}`);
  console.log(`Current Epoch: ${currentEpoch}`);
  console.log(`Epoch Period: ${epochPeriod}`);
  console.log(`Challenge Period: ${challengePeriod}`);
  console.log(`---`);

  let cursor = challengableEpochStart;
  while (cursor <= currentEpoch) {
    const claim = await web3_veaOutbox.claims(cursor);
    if (claim.bridger != "0x0000000000000000000000000000000000000000") {
      web3_veaInbox.interface.events["MessageSent(uint256,address,address,bytes)"];
      const merkleroot = await web3_veaInbox.stateRootSnapshots(cursor);
      if (merkleroot !== claim.stateroot) {
        console.log(`Epoch ${cursor}: *INVALID CLAIM*`);
        const receipt = await web3_veaOutbox.challenges(cursor);
        if (receipt.challenger == "0x0000000000000000000000000000000000000000") {
          const txn = await web3_veaOutbox.challenge(cursor, { value: deposit });
          console.log(`Epoch ${cursor}: Challenged`);
          console.log(`Challenge Txn: ${txn}`);
        }
      }
    } else console.log(`Epoch ${cursor}: No claim.`);
    cursor++;
  }
})();

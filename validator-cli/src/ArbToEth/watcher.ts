import { getVeaInboxArbToEth, getVeaOutboxArbToEth, getEvents } from "./ethers";

require("dotenv").config();

(async () => {
  const veaInbox = getVeaInboxArbToEth(process.env.VEAINBOX_ADDRESS, process.env.PRIVATE_KEY, process.env.RPC_VEAINBOX);

  const veaOutbox = getVeaOutboxArbToEth(
    process.env.VEAOUTBOX_ADDRESS,
    process.env.PRIVATE_KEY,
    process.env.RPC_VEAOUTBOX
  );

  const deposit = await veaOutbox.deposit();
  const challengePeriod = (await veaOutbox.challengePeriod()).toNumber();
  const epochPeriod = (await veaOutbox.epochPeriod()).toNumber();

  /*
  const filter = web3_veaOutbox.filters["MessageRelayed(uint64)"];
  const events = await getEvents(web3_veaOutbox.address, 0, "latest", filter);
  console.log(events)
  return;*/

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
    const claim = await veaOutbox.claims(cursor);

    if (claim.bridger != "0x0000000000000000000000000000000000000000") {
      const merkleroot = await veaInbox.snapshots(cursor);

      if (merkleroot !== claim.stateRoot) {
        console.log(`Epoch ${cursor}: *INVALID CLAIM*`);
        const challenge = await veaOutbox.challenges(cursor);

        if (challenge.challenger == "0x0000000000000000000000000000000000000000") {
          const txn = await veaOutbox.challenge(cursor, { value: deposit });
          console.log(`Epoch ${cursor}: Challenged`);
          console.log(`Challenge Txn: ${txn}`);
        }
      }
    } else console.log(`Epoch ${cursor}: No claim.`);
    cursor++;
  }
})();

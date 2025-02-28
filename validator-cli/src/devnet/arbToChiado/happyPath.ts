import { happyPath, initialize } from "../../utils/devnet";

require("dotenv").config();

(async () => {
  let [veaInboxArbSepoliaToSepolia, epochPeriod, lastSavedCount, veaOutboxSepolia, deposit] = await initialize(
    process.env.VEAOUTBOX_ARBSEPOLIA_TO_CHIADO_ADDRESS,
    process.env.VEAINBOX_ARBSEPOLIA_TO_CHIADO_ADDRESS,
    process.env.RPC_CHIADO
  );

  while (1) {
    lastSavedCount = await happyPath(
      veaInboxArbSepoliaToSepolia,
      epochPeriod,
      lastSavedCount,
      veaOutboxSepolia,
      deposit
    );
    const currentTS = Math.floor(Date.now() / 1000);
    const delayAmount = (epochPeriod - (currentTS % epochPeriod)) * 1000 + 30000;
    console.log("waiting for the next epoch. . .", Math.floor(delayAmount / 1000), "seconds");
    await delay(delayAmount);
  }
})();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { happyPath, initializeGnosis } from "../utils/devnet";
import { schedule } from "@netlify/functions";
import { StatusCodes } from "http-status-codes";
require("dotenv").config();

async function validatorChiado() {
  let [veaInboxArbGoerliToChiado, epochPeriod, lastSavedCount, veaOutboxChiado, deposit] = await initializeGnosis(
    process.env.VEAOUTBOX_ARBGOERLI_TO_CHIADO_ADDRESS,
    process.env.VEAINBOX_ARBGOERLI_TO_CHIADO_ADDRESS,
    process.env.RPC_CHIADO
  );
  await happyPath(true, veaInboxArbGoerliToChiado, epochPeriod, lastSavedCount, veaOutboxChiado, deposit);
  return {
    statusCode: StatusCodes.OK,
  };
}

export const handler = schedule("* * * * *", validatorChiado);

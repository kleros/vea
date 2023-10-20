import { happyPath, initialize } from "../utils/devnet";
import { schedule } from "@netlify/functions";
import { StatusCodes } from "http-status-codes";
require("dotenv").config();

async function validatorChiado() {
  let [veaInboxArbGoerliToGoerli, epochPeriod, lastSavedCount, veaOutboxGoerli, deposit] = await initialize(
    process.env.VEAOUTBOX_ARBGOERLI_TO_GOERLI_ADDRESS,
    process.env.VEAINBOX_ARBGOERLI_TO_GOERLI_ADDRESS,
    process.env.RPC_GOERLI
  );
  await happyPath(veaInboxArbGoerliToGoerli, epochPeriod, lastSavedCount, veaOutboxGoerli, deposit);
  return {
    statusCode: StatusCodes.OK,
  };
}

export const handler = schedule("* * * * *", validatorChiado);

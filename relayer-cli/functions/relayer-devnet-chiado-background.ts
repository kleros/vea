import { schedule } from "@netlify/functions";
import { relayAllFor } from "./utils/relay";
import { StatusCodes } from "http-status-codes";

const relayer = async () => {
  try {
    await relayAllFor(10200, 0, "0xe6aC8CfF97199A67b8121a3Ce3aC98772f90B94b");
  } catch (e) {
    console.error(e);
    return {
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  return {
    statusCode: StatusCodes.OK,
  };
};
export const handler = schedule("@hourly", relayer);

import dotenv from "dotenv";
import logger from "./logger";

dotenv.config();

function envVar(key: string): string {
  const value = process.env[key];
  if (value === undefined) {
    const error = new Error(`Environment variable ${key} is undefined`);
    logger.error(error);
    throw error;
  }
  return value;
}

export default envVar;

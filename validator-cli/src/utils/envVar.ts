import dotenv from "dotenv";

dotenv.config();

function envVar(key: string): string {
  const value = process.env[key];
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is undefined`);
  }
  return value;
}

export default envVar;

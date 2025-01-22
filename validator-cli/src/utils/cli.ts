import { InvalidBotPathError } from "./errors";
export enum BotPaths {
  CLAIMER = 0, // happy path
  CHALLENGER = 1, // unhappy path
  BOTH = 2, // both happy and unhappy path
}

interface BotPathParams {
  cliCommand: string[];
  defaultPath?: BotPaths;
}

/**
 * Get the bot path from the command line arguments
 * @param defaultPath - default path to use if not specified in the command line arguments
 * @returns BotPaths - the bot path (BotPaths)
 */
export function getBotPath({ cliCommand, defaultPath = BotPaths.BOTH }: BotPathParams): number {
  const args = cliCommand.slice(2);
  const pathFlag = args.find((arg) => arg.startsWith("--path="));

  const path = pathFlag ? pathFlag.split("=")[1] : null;

  const pathMapping: Record<string, BotPaths> = {
    claimer: BotPaths.CLAIMER,
    challenger: BotPaths.CHALLENGER,
    both: BotPaths.BOTH,
  };

  if (path && !(path in pathMapping)) {
    throw new InvalidBotPathError();
  }

  return path ? pathMapping[path] : defaultPath;
}

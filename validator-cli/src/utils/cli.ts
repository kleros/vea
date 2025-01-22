export enum BotPaths {
  CLAIMER = 0, // happy path
  CHALLENGER = 1, // unhappy path
  BOTH = 2, // both happy and unhappy path
}

/**
 * Get the bot path from the command line arguments
 * @param defaultPath - default path to use if not specified in the command line arguments
 * @returns BotPaths - the bot path (BotPaths)
 */
export function getBotPath(defaultPath: number = BotPaths.BOTH): number {
  const args = process.argv.slice(2);
  const pathFlag = args.find((arg) => arg.startsWith("--path="));

  const path = pathFlag ? pathFlag.split("=")[1] : null;

  const pathMapping: Record<string, BotPaths> = {
    claimer: BotPaths.CLAIMER,
    challenger: BotPaths.CHALLENGER,
    both: BotPaths.BOTH,
  };

  if (path && !(path in pathMapping)) {
    console.error(`Error: Invalid path '${path}'. Use one of: ${Object.keys(pathMapping).join(", ")}.`);
    process.exit(1);
  }

  return path ? pathMapping[path] : defaultPath;
}

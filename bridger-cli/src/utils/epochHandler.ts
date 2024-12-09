const setEpochRange = async (veaOutbox, startEpoch): Promise<Array<number>> => {
  const defaultEpochRollback = 10; // When no start epoch is provided, we will start from current epoch - defaultEpochRollback
  const currentEpoch = Number(await veaOutbox.epochNow());
  if (currentEpoch < startEpoch) {
    throw new Error("Current epoch is less than start epoch");
  }
  if (startEpoch == 0) {
    startEpoch = currentEpoch - defaultEpochRollback;
  }
  const epochs: number[] = new Array(currentEpoch - startEpoch + 1).fill(startEpoch).map((el, i) => el + i);
  return epochs;
};

const getBlockNumberFromEpoch = async (veaOutboxRpc, epoch, epochPeriod): Promise<number> => {
  const latestBlock = await veaOutboxRpc.getBlock("latest");
  const preBlock = await veaOutboxRpc.getBlock(latestBlock.number - 1000);
  const avgBlockTime = (latestBlock.timestamp - preBlock.timestamp) / 1000;

  const epochInSeconds = epoch * epochPeriod;
  const epochBlock = Math.floor(latestBlock.number - (latestBlock.timestamp - epochInSeconds) / avgBlockTime);
  return epochBlock - 100;
};

const checkForNewEpoch = (currentEpoch, epochPeriod): number => {
  if (Math.floor(Date.now() / (1000 * epochPeriod)) - 1 > currentEpoch) {
    currentEpoch = Math.floor(Date.now() / 1000 / epochPeriod) - 1;
  }
  return currentEpoch;
};

export { setEpochRange, getBlockNumberFromEpoch, checkForNewEpoch };

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

enum SenderChains {
  ARBITRUM = 42161,
  ARBITRUM_GOERLI = 421613,
  HARDHAT = 31337,
}
const paramsByChainId = {
  ARBITRUM: {
    epochPeriod: 86400, // 24 hours
  },
  ARBITRUM_GOERLI: {
    epochPeriod: 120, // 2 minutes
  },
  HARDHAT: {
    epochPeriod: 86400, // 2 minutes
  },
};

// TODO: use deterministic deployments
const deploySender: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy, execute } = deployments;
  const chainId = Number(await getChainId());

  const deployer = (await getNamedAccounts()).deployer;
  console.log("deployer: %s", deployer);

  const { epochPeriod } = paramsByChainId[SenderChains[chainId]];

  // ----------------------------------------------------------------------------------------------

  const fastBridgeReceiver = await hre.companionNetworks.receiver.deployments.get("FastBridgeReceiverOnGnosis");

  await deploy("FastBridgeSenderToGnosis", {
    from: deployer,
    contract: "FastBridgeSender",
    args: [epochPeriod, fastBridgeReceiver.address],
    log: true,
  });
};

deploySender.tags = ["ArbToGnosisSender"];
deploySender.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !SenderChains[chainId];
};
deploySender.runAtTheEnd = true;

export default deploySender;

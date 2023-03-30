import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

enum SenderChains {
  ARBITRUM = 42161,
  ARBITRUM_GOERLI = 421613,
  HARDHAT = 31337,
}
const paramsByChainId = {
  ARBITRUM: {
    epochPeriod: 43200, // 12 hours
  },
  ARBITRUM_GOERLI: {
    epochPeriod: 1800, // 30 minutes
  },
  HARDHAT: {
    epochPeriod: 1800, // 30 minutes
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

  const veaOutboxGnosis = await hre.companionNetworks.receiver.deployments.get("VeaOutboxGnosis");

  await deploy("VeaInbox", {
    from: deployer,
    contract: "VeaInbox",
    args: [epochPeriod, veaOutboxGnosis.address],
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
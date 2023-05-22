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
    companion: (hre: HardhatRuntimeEnvironment) => hre.companionNetworks.gnosischain,
  },
  HARDHAT: {
    epochPeriod: 1800, // 30 minutes
  },
};

// TODO: use deterministic deployments
const deployInbox: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy, execute } = deployments;
  const chainId = Number(await getChainId());

  const deployer = (await getNamedAccounts()).deployer;
  console.log("deployer: %s", deployer);

  const { epochPeriod, companion } = paramsByChainId[SenderChains[chainId]];

  // ----------------------------------------------------------------------------------------------

  const veaOutboxGnosis = await companion(hre).deployments.get("VeaOutboxGnosis");

  await deploy("VeaInboxArbToGnosis", {
    from: deployer,
    args: [epochPeriod, veaOutboxGnosis.address],
    log: true,
  });
};

deployInbox.tags = ["ArbToGnosisInbox"];
deployInbox.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !(chainId === 42161 || chainId === 31337);
};
deployInbox.runAtTheEnd = true;

export default deployInbox;

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

enum SenderChains {
  ARBITRUM_GOERLI = 421613,
  HARDHAT = 31337,
}

const paramsByChainId = {
  ARBITRUM_GOERLI: {
    epochPeriod: 1800, // 30 minutes
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

  const { epochPeriod } = paramsByChainId[SenderChains[chainId]];

  // ----------------------------------------------------------------------------------------------

  const veaOutboxGnosis = await hre.companionNetworks.chiado.deployments.get("VeaOutboxGnosis");

  await deploy("VeaInboxArbToGnosisDevnet", {
    from: deployer,
    contract: "VeaInboxArbToGnosis",
    args: [epochPeriod, veaOutboxGnosis.address],
    log: true,
  });
};

deployInbox.tags = ["ArbGoerliToChiadoInbox"];
deployInbox.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !(chainId === 42161 || chainId === 31337);
};
deployInbox.runAtTheEnd = true;

export default deployInbox;

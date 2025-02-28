import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

enum SenderChains {
  ARBITRUM_SEPOLIA = 421614,
  HARDHAT = 31337,
}

const paramsByChainId = {
  ARBITRUM_SEPOLIA: {
    epochPeriod: 1800, // 1 hour
  },
  HARDHAT: {
    epochPeriod: 600, // 10 minutes
  },
};

// TODO: use deterministic deployments
const deployInbox: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy } = deployments;
  const chainId = Number(await getChainId());

  const deployer = (await getNamedAccounts()).deployer;
  console.log("deployer: %s", deployer);

  const { epochPeriod } = paramsByChainId[SenderChains[chainId]];

  // ----------------------------------------------------------------------------------------------

  const veaOutboxGnosis = await hre.companionNetworks.chiado.deployments.get("VeaOutboxArbToGnosisDevnet");

  const inbox = await deploy("VeaInboxArbToGnosisDevnet", {
    from: deployer,
    contract: "VeaInboxArbToGnosis",
    args: [epochPeriod, veaOutboxGnosis.address],
    log: true,
  });

  console.log("VeaInboxArbToGnosisDevnet deployed to: %s", inbox.address);
};

deployInbox.tags = ["ArbSepoliaToChiadoInbox"];
deployInbox.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !(chainId === 421614 || chainId === 31337);
};
deployInbox.runAtTheEnd = true;

export default deployInbox;

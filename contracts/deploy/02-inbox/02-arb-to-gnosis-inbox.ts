import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

enum SenderChains {
  ARBITRUM = 42161,
  ARBITRUM_GOERLI = 421613,
  HARDHAT = 31337,
}
const paramsByChainId = {
  ARBITRUM: {
    epochPeriod: 3600, // 1 hours
    companion: (hre: HardhatRuntimeEnvironment) => hre.companionNetworks.gnosischain,
  },
  ARBITRUM_GOERLI: {
    epochPeriod: 3600, // 1 hours
    companion: (hre: HardhatRuntimeEnvironment) => hre.companionNetworks.chiado,
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

  const veaOutboxGnosis = await companion(hre).deployments.get(
    "VeaOutboxArbToGnosis" + (chainId === 42161 ? "" : "Testnet")
  );

  await deploy("VeaInboxArbToGnosis" + (chainId === 42161 ? "" : "Testnet"), {
    contract: "VeaInboxArbToGnosis",
    from: deployer,
    args: [epochPeriod, veaOutboxGnosis.address],
    log: true,
  });
};

deployInbox.tags = ["ArbToGnosisInbox"];
deployInbox.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !SenderChains[chainId];
};
deployInbox.runAtTheEnd = true;

export default deployInbox;

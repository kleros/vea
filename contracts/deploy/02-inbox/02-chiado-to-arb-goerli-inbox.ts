import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

enum SenderChains {
  GNOSIS_CHIADO = 10200,
  HARDHAT = 31337,
}

const paramsByChainId = {
  GNOSIS_CHIADO: {
    epochPeriod: 1800, // 30 minutes
    amb: "0x99Ca51a3534785ED619f46A79C7Ad65Fa8d85e7a",
  },
  HARDHAT: {
    amb: ethers.constants.AddressZero,
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

  const { epochPeriod, amb } = paramsByChainId[SenderChains[chainId]];

  // ----------------------------------------------------------------------------------------------

  const veaOutboxArb = await hre.companionNetworks.arbitrumGoerli.deployments.get("VeaOutboxGnosisToArbDevnet");

  const gasOptions = {
    maxFeePerGas: ethers.utils.parseUnits("1", "gwei"),
    maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei"),
  };

  const inbox = await deploy("VeaInboxGnosisToArbDevnet", {
    from: deployer,
    contract: "VeaInboxGnosisToArb",
    args: [epochPeriod, veaOutboxArb.address, amb],
    log: true,
    ...gasOptions,
  });

  console.log("VeaInboxGnosisToArbDevnet deployed to: %s", inbox.address);
};

deployInbox.tags = ["ChiadoToArbGoerliInbox"];
deployInbox.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !SenderChains[chainId];
};
deployInbox.runAtTheEnd = true;

export default deployInbox;

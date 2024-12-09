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
    amb: "0x8448E15d0e706C0298dECA99F0b4744030e59d7d", // https://docs.gnosischain.com/bridges/About%20Token%20Bridges/amb-bridge#key-contracts
  },
  HARDHAT: {
    amb: ethers.ZeroAddress,
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

  const { epochPeriod, amb } = paramsByChainId[SenderChains[chainId]];

  // ----------------------------------------------------------------------------------------------

  const veaOutboxArb = await hre.companionNetworks.arbitrumSepolia.deployments.get("VeaOutboxGnosisToArbDevnet");

  const gasOptions = {
    maxFeePerGas: String(ethers.parseUnits("1", "gwei")),
    maxPriorityFeePerGas: String(ethers.parseUnits("1", "gwei")),
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

deployInbox.tags = ["ChiadoToArbSepoliaInbox"];
deployInbox.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !SenderChains[chainId];
};
deployInbox.runAtTheEnd = true;

export default deployInbox;

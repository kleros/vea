import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

enum RouterChains {
  ETHEREUM_SEPOLIA = 11155111,
  HARDHAT = 31337,
}

const paramsByChainId = {
  ETHEREUM_SEPOLIA: {
    arbitrumBridge: "0x38f918D0E9F1b721EDaA41302E399fa1B79333a9", // https://developer.arbitrum.io/useful-addresses
    amb: "0xf2546D6648BD2af6a008A7e7C1542BB240329E11", // https://docs.gnosischain.com/bridges/About%20Token%20Bridges/amb-bridge#key-contracts
  },
  HARDHAT: {
    arbitrumBridge: ethers.constants.AddressZero,
    amb: ethers.constants.AddressZero,
  },
};

// TODO: use deterministic deployments
const deployRouter: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy } = deployments;
  const chainId = Number(await getChainId());

  // fallback to hardhat node signers on local network
  const deployer = (await getNamedAccounts()).deployer ?? (await hre.ethers.getSigners())[0].address;
  console.log("deployer: %s", deployer);

  const { arbitrumBridge, amb } = paramsByChainId[RouterChains[chainId]];

  // ----------------------------------------------------------------------------------------------
  const hardhatDeployer = async () => {
    const veaOutbox = await deployments.get("VeaOutboxGnosisToArbDevnet");
    const veaInbox = await deployments.get("VeaInboxGnosisToArbDevnet");

    const router = await deploy("RouterGnosisToArbDevnet", {
      from: deployer,
      contract: "RouterGnosisToArb",
      args: [arbitrumBridge, amb, veaInbox.address, veaOutbox.address, chainId],
    });
  };

  // ----------------------------------------------------------------------------------------------
  const liveDeployer = async () => {
    const veaOutbox = await hre.companionNetworks.arbitrumSepolia.deployments.get("VeaOutboxGnosisToArbDevnet");
    const veaInbox = await hre.companionNetworks.chiado.deployments.get("VeaInboxGnosisToArbDevnet");

    const router = await deploy("RouterGnosisToArbDevnet", {
      from: deployer,
      contract: "RouterGnosisToArb",
      args: [arbitrumBridge, amb, veaInbox.address, veaOutbox.address, chainId],
      log: true,
    });

    console.log("RouterGnosisToArbDevnet deployed to: %s", router.address);
  };

  // ----------------------------------------------------------------------------------------------
  if (chainId === 31337) {
    await hardhatDeployer();
  } else {
    await liveDeployer();
  }
};

deployRouter.tags = ["ChiadoToArbSepoliaRouter"];
deployRouter.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !RouterChains[chainId];
};
deployRouter.runAtTheEnd = true;

export default deployRouter;

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

enum RouterChains {
  ETHEREUM_MAINNET = 1,
  ETHEREUM_SEPOLIA = 11155111,
  HARDHAT = 31337,
}

const paramsByChainId = {
  ETHEREUM_MAINNET: {
    arbitrumBridge: "0x8315177aB297bA92A06054cE80a67Ed4DBd7ed3a", // https://developer.arbitrum.io/useful-addresses
    amb: "0x4C36d2919e407f0Cc2Ee3c993ccF8ac26d9CE64e",
  },
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
    const veaOutbox = await deployments.get("VeaOutboxGnosisToArb" + (chainId === 100 ? "" : "Testnet"));
    const veaInbox = await deployments.get("VeaInboxGnosisToArb" + (chainId === 100 ? "" : "Testnet"));

    const router = await deploy("RouterGnosisToArb" + (chainId === 100 ? "" : "Testnet"), {
      from: deployer,
      contract: "RouterGnosisToArb",
      args: [arbitrumBridge, amb, veaInbox.address, veaOutbox.address, chainId],
    });
  };

  // ----------------------------------------------------------------------------------------------
  const liveDeployer = async () => {
    const outboxNetwork = chainId === 1 ? hre.companionNetworks.arbitrum : hre.companionNetworks.arbitrumSepolia;
    const inboxNetwork = chainId === 1 ? hre.companionNetworks.gnosischain : hre.companionNetworks.chiado;
    const veaOutbox = await outboxNetwork.deployments.get("VeaOutboxGnosisToArb" + (chainId === 1 ? "" : "Testnet"));
    const veaInbox = await inboxNetwork.deployments.get("VeaInboxGnosisToArb" + (chainId === 1 ? "" : "Testnet"));

    const router = await deploy("RouterGnosisToArb" + (chainId === 1 ? "" : "Testnet"), {
      from: deployer,
      contract: "RouterGnosisToArb",
      args: [arbitrumBridge, amb, veaInbox.address, veaOutbox.address, chainId],
      log: true,
    });

    console.log("RouterGnosisToArb" + (chainId === 1 ? "" : "Testnet") + " deployed to: %s", router.address);
  };

  // ----------------------------------------------------------------------------------------------
  if (chainId === 31337) {
    await hardhatDeployer();
  } else {
    await liveDeployer();
  }
};

deployRouter.tags = ["GnosisToArbRouter"];
deployRouter.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !RouterChains[chainId];
};
deployRouter.runAtTheEnd = true;

export default deployRouter;

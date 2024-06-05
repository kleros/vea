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
    amb: "0x87A19d769D875964E9Cd41dDBfc397B2543764E6",
  },
  HARDHAT: {
    arbitrumInbox: ethers.constants.AddressZero,
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
    const veaOutbox = await deployments.get("VeaOutboxArbToGnosis");
    const veaInbox = await deployments.get("VeaInboxArbToGnosis");

    const router = await deploy("RouterArbToGnosis", {
      from: deployer,
      contract: "RouterArbToGnosis",
      args: [arbitrumBridge, amb, veaInbox.address, veaOutbox.address],
    });
  };

  // ----------------------------------------------------------------------------------------------
  const liveDeployer = async () => {
    const outboxNetwork = chainId === 1 ? hre.companionNetworks.gnosischain : hre.companionNetworks.chiado;
    const inboxNetwork = chainId === 1 ? hre.companionNetworks.arbitrum : hre.companionNetworks.arbitrumSepolia;
    const veaOutbox = await outboxNetwork.deployments.get("VeaOutboxArbToGnosis" + (chainId === 1 ? "" : "Testnet"));
    const veaInbox = await inboxNetwork.deployments.get("VeaInboxArbToGnosis" + (chainId === 1 ? "" : "Testnet"));

    const router = await deploy("RouterArbToGnosis" + (chainId === 1 ? "" : "Testnet"), {
      from: deployer,
      contract: "RouterArbToGnosis",
      args: [arbitrumBridge, amb, veaInbox.address, veaOutbox.address],
      log: true,
    });
  };

  // ----------------------------------------------------------------------------------------------
  if (chainId === 31337) {
    await hardhatDeployer();
  } else {
    await liveDeployer();
  }
};

deployRouter.tags = ["ArbToGnosisRouter"];
deployRouter.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !RouterChains[chainId];
};
deployRouter.runAtTheEnd = true;

export default deployRouter;

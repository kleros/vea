import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

enum RouterChains {
  ETHEREUM_MAINNET = 1,
  HARDHAT = 31337,
}

const paramsByChainId = {
  ETHEREUM_MAINNET: {
    arbitrumBridge: "0x8315177aB297bA92A06054cE80a67Ed4DBd7ed3a", // https://developer.arbitrum.io/useful-addresses
    amb: "0x75Df5AF045d91108662D8080fD1FEFAd6aA0bb59",
  },
  HARDHAT: {
    arbitrumInbox: ethers.constants.AddressZero,
    amb: ethers.constants.AddressZero,
  },
};

// TODO: use deterministic deployments
const deployRouter: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy, execute } = deployments;
  const chainId = Number(await getChainId());

  // fallback to hardhat node signers on local network
  const deployer = (await getNamedAccounts()).deployer ?? (await hre.ethers.getSigners())[0].address;
  console.log("deployer: %s", deployer);

  const { arbitrumInbox, amb } = paramsByChainId[RouterChains[chainId]];

  // ----------------------------------------------------------------------------------------------
  const hardhatDeployer = async () => {
    const veaOutbox = await deployments.get("VeaOutboxArbToGnosis");
    const veaInbox = await deployments.get("VeaInboxArbToGnosis");

    const router = await deploy("RouterArbToGnosis", {
      from: deployer,
      contract: "RouterArbToGnosis",
      args: [arbitrumInbox, amb, veaInbox.address, veaOutbox.address],
    });
  };

  // ----------------------------------------------------------------------------------------------
  const liveDeployer = async () => {
    const veaOutbox = await hre.companionNetworks.gnosischain.deployments.get("VeaOutboxArbToGnosis");
    const veaInbox = await hre.companionNetworks.arbitrum.deployments.get("VeaInboxArbToGnosis");

    const router = await deploy("RouterArbToGnosis", {
      from: deployer,
      contract: "RouterArbToGnosis",
      args: [arbitrumInbox, amb, veaInbox.address, veaOutbox.address],
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

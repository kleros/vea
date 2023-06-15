import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

enum RouterChains {
  ETHEREUM_GOERLI = 5,
  HARDHAT = 31337,
}

const paramsByChainId = {
  ETHEREUM_GOERLI: {
    arbitrumBridge: "0xaf4159A80B6Cc41ED517DB1c453d1Ef5C2e4dB72", // https://developer.arbitrum.io/useful-addresses
    amb: "0x99Ca51a3534785ED619f46A79C7Ad65Fa8d85e7a",
  },
  HARDHAT: {
    arbitrumBridge: ethers.constants.AddressZero,
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

  const { arbitrumBridge, amb } = paramsByChainId[RouterChains[chainId]];

  // ----------------------------------------------------------------------------------------------
  const hardhatDeployer = async () => {
    const veaOutbox = await deployments.get("VeaOutboxArbToGnosisDevnet");
    const veaInbox = await deployments.get("VeaInboxArbToGnosisDevnet");

    const router = await deploy("RouterArbToGnosisDevnet", {
      from: deployer,
      contract: "RouterArbToGnosis",
      args: [arbitrumBridge, amb, veaInbox.address, veaOutbox.address],
    });
  };

  // ----------------------------------------------------------------------------------------------
  const liveDeployer = async () => {
    const veaOutbox = await hre.companionNetworks.chiado.deployments.get("VeaOutboxArbToGnosisDevnet");
    const veaInbox = await hre.companionNetworks.arbitrumGoerli.deployments.get("VeaInboxArbToGnosisDevnet");

    const router = await deploy("RouterArbToGnosisDevnet", {
      from: deployer,
      contract: "RouterArbToGnosis",
      args: [arbitrumBridge, amb, veaInbox.address, veaOutbox.address],
      log: true,
    });

    console.log("RouterArbToGnosisDevnet deployed to: %s", router.address);
  };

  // ----------------------------------------------------------------------------------------------
  if (chainId === 31337) {
    await hardhatDeployer();
  } else {
    await liveDeployer();
  }
};

deployRouter.tags = ["ArbGoerliToChiadoRouter"];
deployRouter.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !RouterChains[chainId];
};
deployRouter.runAtTheEnd = true;

export default deployRouter;

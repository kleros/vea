import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

enum RouterChains {
  ETHEREUM_MAINNET = 1,
  ETHEREUM_GOERLI = 5,
  HARDHAT = 31337,
}

const paramsByChainId = {
  ETHEREUM_MAINNET: {
    arbitrumBridge: "0x8315177aB297bA92A06054cE80a67Ed4DBd7ed3a", // https://developer.arbitrum.io/useful-addresses
    amb: "0x4C36d2919e407f0Cc2Ee3c993ccF8ac26d9CE64e",
  },
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
    const outboxNetwork = chainId === 1 ? hre.companionNetworks.arbitrum : hre.companionNetworks.arbitrumGoerli;
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

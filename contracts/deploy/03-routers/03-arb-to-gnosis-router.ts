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
    arbitrumInbox: ethers.constants.AddressZero,
    amb: ethers.constants.AddressZero,
  },
};

// TODO: use deterministic deployments
const deployRouter: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy } = deployments;

  // fallback to hardhat node signers on local network
  const [namedAccounts, signers, rawChainId] = await Promise.all([
    getNamedAccounts(),
    hre.ethers.getSigners(),
    getChainId(),
  ]);

  const deployer = namedAccounts.deployer ?? signers[0].address;
  const chainId = Number(rawChainId);

  console.log("deploying to chainId %s with deployer %s", chainId, deployer);

  const { arbitrumBridge, amb } = paramsByChainId[RouterChains[chainId]];

  // ----------------------------------------------------------------------------------------------
  const hardhatDeployer = async () => {
    const [veaOutbox, veaInbox, amb] = await Promise.all([
      deployments.get("VeaOutboxArbToGnosis"),
      deployments.get("VeaInboxArbToGnosis"),
      deployments.get("MockAMB"),
    ]);

    const sequencerInbox = await deploy("SequencerInboxMock", {
      from: deployer,
      contract: "SequencerInboxMock",
      args: ["10"],
    });
    const outbox = await deploy("OutboxMock", {
      from: deployer,
      args: [veaInbox.address],
      log: true,
    });

    const arbitrumBridge = await deploy("BridgeMock", {
      from: deployer,
      contract: "BridgeMock",
      args: [outbox.address, sequencerInbox.address],
    });

    const router = await deploy("RouterArbToGnosis", {
      from: deployer,
      contract: "RouterArbToGnosis",
      args: [arbitrumBridge.address, amb.address, veaInbox.address, veaOutbox.address],
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
  return !RouterChains[chainId];
};
deployRouter.runAtTheEnd = true;

export default deployRouter;

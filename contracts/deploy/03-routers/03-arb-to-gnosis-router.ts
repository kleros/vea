import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { ZeroAddress } from "ethers";

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
    arbitrumBridge: ZeroAddress,
    amb: ZeroAddress,
  },
} as const;

// TODO: use deterministic deployments
const deployRouter: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy } = deployments;
  const chainId = Number(await getChainId());

  // fallback to hardhat node signers on local network
  const namedAccounts = await getNamedAccounts();
  const signers = await hre.ethers.getSigners();
  const deployer = namedAccounts.deployer ?? signers[0].address;
  console.log("deployer: %s", deployer);

  const { arbitrumBridge, amb } = paramsByChainId[RouterChains[chainId] as keyof typeof paramsByChainId];

  // ----------------------------------------------------------------------------------------------
  const hardhatDeployer = async () => {
    const [veaOutbox, veaInbox, ambDeployment] = await Promise.all([
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

    const mockBridge = await deploy("BridgeMock", {
      from: deployer,
      contract: "BridgeMock",
      args: [outbox.address, sequencerInbox.address],
    });

    const router = await deploy("RouterArbToGnosis", {
      from: deployer,
      contract: "RouterArbToGnosis",
      args: [mockBridge.address, ambDeployment.address, veaInbox.address, veaOutbox.address],
    });
  };

  // ----------------------------------------------------------------------------------------------
  const liveDeployer = async () => {
    const outboxNetwork =
      chainId === RouterChains.ETHEREUM_MAINNET ? hre.companionNetworks.gnosischain : hre.companionNetworks.chiado;
    const inboxNetwork =
      chainId === RouterChains.ETHEREUM_MAINNET
        ? hre.companionNetworks.arbitrum
        : hre.companionNetworks.arbitrumSepolia;

    const suffix = chainId === RouterChains.ETHEREUM_MAINNET ? "" : "Testnet";
    const veaOutbox = await outboxNetwork.deployments.get(`VeaOutboxArbToGnosis${suffix}`);
    const veaInbox = await inboxNetwork.deployments.get(`VeaInboxArbToGnosis${suffix}`);

    const router = await deploy(`RouterArbToGnosis${suffix}`, {
      from: deployer,
      contract: "RouterArbToGnosis",
      args: [arbitrumBridge, amb, veaInbox.address, veaOutbox.address],
      log: true,
    });

    console.log(`RouterArbToGnosis${suffix} deployed to: ${router.address}`);
  };

  // ----------------------------------------------------------------------------------------------
  if (chainId === RouterChains.HARDHAT) {
    await hardhatDeployer();
  } else {
    await liveDeployer();
  }
};

deployRouter.tags = ["ArbToGnosisRouter"];
deployRouter.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log("Chain ID:", chainId);
  return !RouterChains[chainId];
};
deployRouter.runAtTheEnd = true;

export default deployRouter;

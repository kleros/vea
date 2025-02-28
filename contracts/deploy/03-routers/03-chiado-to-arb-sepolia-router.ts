import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ZeroAddress } from "ethers";

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
    arbitrumBridge: ZeroAddress,
    amb: ZeroAddress,
  },
} as const;

const DEPLOYMENT_NAME = "RouterGnosisToArbDevnet";
const CONTRACT_NAME = "RouterGnosisToArb";

// TODO: use deterministic deployments
const deployRouter: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy } = deployments;
  const chainId = Number(await getChainId());

  // fallback to hardhat node signers on local network
  const namedAccounts = await getNamedAccounts();
  const signers = await hre.ethers.getSigners();
  const deployer = namedAccounts.deployer ?? signers[0].address;
  console.log("Deploying with address:", deployer);

  const { arbitrumBridge, amb } = paramsByChainId[RouterChains[chainId] as keyof typeof paramsByChainId];

  // ----------------------------------------------------------------------------------------------
  const hardhatDeployer = async () => {
    const [veaOutbox, veaInbox] = await Promise.all([
      deployments.get("VeaOutboxGnosisToArbDevnet"),
      deployments.get("VeaInboxGnosisToArbDevnet"),
    ]);

    const router = await deploy(DEPLOYMENT_NAME, {
      from: deployer,
      contract: CONTRACT_NAME,
      args: [arbitrumBridge, amb, veaInbox.address, veaOutbox.address, chainId],
      log: true,
    });

    console.log("Local deployment complete - Router address:", router.address);
  };

  // ----------------------------------------------------------------------------------------------
  const liveDeployer = async () => {
    const [veaOutbox, veaInbox] = await Promise.all([
      hre.companionNetworks.arbitrumSepolia.deployments.get("VeaOutboxGnosisToArbDevnet"),
      hre.companionNetworks.chiado.deployments.get("VeaInboxGnosisToArbDevnet"),
    ]);

    const router = await deploy(DEPLOYMENT_NAME, {
      from: deployer,
      contract: CONTRACT_NAME,
      args: [arbitrumBridge, amb, veaInbox.address, veaOutbox.address, chainId],
      log: true,
    });

    console.log(`Router deployed to: ${router.address} on network ${RouterChains[chainId]}`);
  };

  // ----------------------------------------------------------------------------------------------
  try {
    if (chainId === RouterChains.HARDHAT) {
      await hardhatDeployer();
    } else {
      await liveDeployer();
    }
  } catch (error) {
    console.error("Deployment failed:", error);
    throw error;
  }
};

deployRouter.tags = ["ChiadoToArbSepoliaRouter"];
deployRouter.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log("Current chain ID:", chainId);
  const shouldSkip = !RouterChains[chainId];
  if (shouldSkip) {
    console.log(`Skipping deployment for chain ${chainId} - not in supported chains`);
  }
  return shouldSkip;
};
deployRouter.runAtTheEnd = true;

export default deployRouter;

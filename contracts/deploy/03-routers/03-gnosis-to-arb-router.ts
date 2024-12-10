import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
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

interface NetworkConfig {
  outboxNetwork: string;
  inboxNetwork: string;
}

const getNetworkConfig = (chainId: number): NetworkConfig => ({
  outboxNetwork: chainId === RouterChains.ETHEREUM_MAINNET ? "arbitrum" : "arbitrumSepolia",
  inboxNetwork: chainId === RouterChains.ETHEREUM_MAINNET ? "gnosischain" : "chiado",
});

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
  const suffix = chainId === RouterChains.ETHEREUM_MAINNET ? "" : "Testnet";
  const contractBaseName = "RouterGnosisToArb";
  const deploymentName = `${contractBaseName}${suffix}`;

  if (!(RouterChains[chainId] in paramsByChainId)) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  // ----------------------------------------------------------------------------------------------
  const hardhatDeployer = async () => {
    const [veaOutbox, veaInbox] = await Promise.all([
      deployments.get(`VeaOutboxGnosisToArb${suffix}`),
      deployments.get(`VeaInboxGnosisToArb${suffix}`),
    ]);

    const router = await deploy(deploymentName, {
      from: deployer,
      contract: contractBaseName,
      args: [arbitrumBridge, amb, veaInbox.address, veaOutbox.address, chainId],
      log: true,
    });

    console.log(`Local deployment complete - ${deploymentName} deployed to: ${router.address}`);
  };

  // ----------------------------------------------------------------------------------------------
  const liveDeployer = async () => {
    const { outboxNetwork, inboxNetwork } = getNetworkConfig(chainId);

    try {
      const [veaOutbox, veaInbox] = await Promise.all([
        hre.companionNetworks[outboxNetwork].deployments.get(`VeaOutboxGnosisToArb${suffix}`),
        hre.companionNetworks[inboxNetwork].deployments.get(`VeaInboxGnosisToArb${suffix}`),
      ]);

      const router = await deploy(deploymentName, {
        from: deployer,
        contract: contractBaseName,
        args: [arbitrumBridge, amb, veaInbox.address, veaOutbox.address, chainId],
        log: true,
      });

      console.log(`${deploymentName} deployed to: ${router.address}`);
    } catch (error) {
      console.error("Failed to deploy:", error);
      throw error;
    }
  };

  // ----------------------------------------------------------------------------------------------
  if (chainId === RouterChains.HARDHAT) {
    await hardhatDeployer();
  } else {
    await liveDeployer();
  }
};

deployRouter.tags = ["GnosisToArbRouter"];
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

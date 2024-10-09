import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import getContractAddress from "../../deploy-helpers/getContractAddress";
import { ethers } from "hardhat";

enum SenderChains {
  ARBITRUM = 42161,
  ARBITRUM_SEPOLIA = 421614,
  HARDHAT = 31337,
}

const paramsByChainId = {
  ARBITRUM: {
    epochPeriod: 3600, // 1 hours
  },
  ARBITRUM_SEPOLIA: {
    epochPeriod: 3600, // 1 hours
  },
  HARDHAT: {
    epochPeriod: 600, // 10 minutes
  },
};

const deployInbox: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { ethers, deployments, getNamedAccounts, getChainId, config } = hre;
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

  const { epochPeriod } = paramsByChainId[SenderChains[chainId]];

  // Hack to predict the deployment address on the sender chain.
  // TODO: use deterministic deployments

  // ----------------------------------------------------------------------------------------------
  const hardhatDeployer = async () => {
    let nonce = await ethers.provider.getTransactionCount(deployer);

    const arbitrumBridgeAddress = getContractAddress(deployer, nonce + 5);

    const arbSysMock = await deploy("ArbSysMock", {
      from: deployer,
      contract: "ArbSysMockWithBridge",
      args: [arbitrumBridgeAddress],
      log: true,
    });

    const routerAddress = getContractAddress(deployer, nonce + 6);
    console.log("calculated future router for nonce %d: %s", nonce + 6, routerAddress);

    const receiverGateway = await deployments.get("ArbToGnosisReceiverGateway");
    const veaInbox = await deploy("VeaInboxArbToGnosis", {
      from: deployer,
      contract: "VeaInboxArbToGnosisMock",
      args: [epochPeriod, routerAddress, arbSysMock.address],
      log: true,
    });

    await deploy("ArbToGnosisSenderGateway", {
      from: deployer,
      contract: "SenderGatewayMock",
      args: [veaInbox.address, receiverGateway.address],
      gasLimit: 4000000,
      log: true,
    });
  };

  // ----------------------------------------------------------------------------------------------
  const liveDeployer = async () => {};

  // ----------------------------------------------------------------------------------------------
  if (chainId === 31337) {
    await hardhatDeployer();
  } else {
    await liveDeployer();
  }
};

deployInbox.tags = ["ArbToGnosisInbox"];
deployInbox.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !SenderChains[chainId];
};
deployInbox.runAtTheEnd = true;

export default deployInbox;

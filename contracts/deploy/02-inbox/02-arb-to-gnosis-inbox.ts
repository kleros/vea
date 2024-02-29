import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import getContractAddress from "../../deploy-helpers/getContractAddress";

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

// TODO: use deterministic deployments
const deployInbox: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { ethers, deployments, getNamedAccounts, getChainId, config } = hre;
  const { deploy } = deployments;
  const chainId = Number(await getChainId());
  const { providers } = ethers;

  const deployer = (await getNamedAccounts()).deployer;
  console.log("deployer: %s", deployer);

  const { epochPeriod } = paramsByChainId[SenderChains[chainId]];

  const routerNetworks = {
    ARBITRUM: config.networks.mainnet,
    ARBITRUM_SEPOLIA: config.networks.sepolia,
    HARDHAT: config.networks.localhost,
  };

  // ----------------------------------------------------------------------------------------------

  const routerChainProvider = new providers.JsonRpcProvider(routerNetworks[SenderChains[chainId]].url);
  let nonceRouter = await routerChainProvider.getTransactionCount(deployer);

  const routerAddress = getContractAddress(deployer, nonceRouter);
  console.log("calculated future router for nonce %d: %s", nonceRouter, routerAddress);

  await deploy("VeaInboxArbToGnosis" + (chainId === 42161 ? "" : "Testnet"), {
    contract: "VeaInboxArbToGnosis",
    from: deployer,
    args: [epochPeriod, routerAddress],
    log: true,
  });
};

deployInbox.tags = ["ArbToGnosisInbox"];
deployInbox.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !SenderChains[chainId];
};
deployInbox.runAtTheEnd = true;

export default deployInbox;

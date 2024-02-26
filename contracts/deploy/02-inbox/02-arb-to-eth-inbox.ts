import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

enum SenderChains {
  ARBITRUM = 42161,
  ARBITRUM_GOERLI = 421613,
  HARDHAT = 31337,
}
const paramsByChainId = {
  ARBITRUM: {
    epochPeriod: 7200, // 2 hours
    companion: (hre: HardhatRuntimeEnvironment) => hre.companionNetworks.mainnet,
  },
  ARBITRUM_GOERLI: {
    epochPeriod: 7200, // 2 hours
    companion: (hre: HardhatRuntimeEnvironment) => hre.companionNetworks.goerli,
  },
  HARDHAT: {
    epochPeriod: 600, // 10 minutes
  },
};

const deployInbox: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy, execute } = deployments;
  const chainId = Number(await getChainId());

  // fallback to hardhat node signers on local network
  const deployer = (await getNamedAccounts()).deployer ?? (await hre.ethers.getSigners())[0].address;
  console.log("deployer: %s", deployer);

  const { epochPeriod, companion } = paramsByChainId[SenderChains[chainId]];

  // ----------------------------------------------------------------------------------------------
  const hardhatDeployer = async () => {
    const veaOutbox = await deployments.get("VeaOutbox");

    const arbSysMock = await deploy("ArbSysMock", { from: deployer, log: true });

    const veaInbox = await deploy("VeaInbox", {
      from: deployer,
      contract: "VeaInboxMockArbToEth",
      args: [arbSysMock.address, epochPeriod, veaOutbox.address],
    });

    const receiverGateway = await deployments.get("ReceiverGateway");

    await deploy("SenderGateway", {
      from: deployer,
      contract: "SenderGatewayMock",
      args: [veaInbox.address, receiverGateway.address],
      gasLimit: 4000000,
      log: true,
    });
  };

  // ----------------------------------------------------------------------------------------------
  const liveDeployer = async () => {
    const veaOutbox = await companion(hre).deployments.get("VeaOutboxArbToEth" + (chainId === 42161 ? "" : "Testnet"));

    await deploy("VeaInboxArbToEth" + (chainId === 42161 ? "" : "Testnet"), {
      contract: "VeaInboxArbToEth",
      from: deployer,
      args: [epochPeriod, veaOutbox.address],
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

deployInbox.tags = ["ArbToEthInbox"];
deployInbox.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !SenderChains[chainId];
};
deployInbox.runAtTheEnd = true;

export default deployInbox;

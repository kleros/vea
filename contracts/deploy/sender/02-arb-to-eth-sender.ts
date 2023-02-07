import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

enum SenderChains {
  ARBITRUM = 42161,
  ARBITRUM_GOERLI = 421613,
  HARDHAT = 31337,
}
const paramsByChainId = {
  ARBITRUM: {
    epochPeriod: 86400, // 24 hours
  },
  ARBITRUM_GOERLI: {
    epochPeriod: 120, // 2 minutes
  },
  HARDHAT: {
    epochPeriod: 86400, // 2 minutes
  },
};

// TODO: use deterministic deployments
const deploySender: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy, execute } = deployments;
  const chainId = Number(await getChainId());

  // fallback to hardhat node signers on local network
  const deployer = (await getNamedAccounts()).deployer ?? (await hre.ethers.getSigners())[0].address;
  console.log("deployer: %s", deployer);

  const { epochPeriod } = paramsByChainId[SenderChains[chainId]];

  // ----------------------------------------------------------------------------------------------
  const hardhatDeployer = async () => {
    const fastBridgeReceiver = await deployments.get("FastBridgeReceiverOnEthereum");

    const arbSysMock = await deploy("ArbSysMock", { from: deployer, log: true });

    const fastBridgeSender = await deploy("FastBridgeSender", {
      from: deployer,
      contract: "FastBridgeSenderOnArbitrumMock",
      args: [arbSysMock.address, epochPeriod, fastBridgeReceiver.address],
    });

    const receiverGateway = await deployments.get("ReceiverGateway");
    const receiverChainId = 31337;

    const senderGateway = await deploy("SenderGateway", {
      from: deployer,
      contract: "SenderGatewayMock",
      args: [fastBridgeSender.address, receiverGateway.address, receiverChainId],
      gasLimit: 4000000,
      log: true,
    });

    const outbox = await deploy("OutboxMock", {
      from: deployer,
      args: [fastBridgeSender.address],
      log: true,
    });

    const bridge = await deploy("BridgeMock", {
      from: deployer,
      args: [outbox.address],
      log: true,
    });

    await deploy("InboxMock", {
      from: deployer,
      args: [bridge.address],
      log: true,
    });
  };

  // ----------------------------------------------------------------------------------------------
  const liveDeployer = async () => {
    const fastBridgeReceiver = await hre.companionNetworks.receiver.deployments.get("FastBridgeReceiverOnEthereum");

    await deploy("FastBridgeSenderToEthereum", {
      from: deployer,
      contract: "FastBridgeSender",
      args: [epochPeriod, fastBridgeReceiver.address],
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

deploySender.tags = ["ArbToEthSender"];
deploySender.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !SenderChains[chainId];
};
deploySender.runAtTheEnd = true;

export default deploySender;

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const SENDER_CHAIN_IDS = [42161, 421613, 31337]; // ArbOne, ArbRinkeby, ArbiGoerli, Hardhat
const epochPeriod = 86400; // 24 hours

// TODO: use deterministic deployments

const deploySenderGateway: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy, execute } = deployments;
  const chainId = Number(await getChainId());

  // fallback to hardhat node signers on local network
  const deployer = (await getNamedAccounts()).deployer ?? (await hre.ethers.getSigners())[0].address;
  console.log("deployer: %s", deployer);

  // ----------------------------------------------------------------------------------------------
  const hardhatDeployer = async () => {
    const fastBridgeReceiver = await deployments.get("FastBridgeReceiverOnEthereum");
    const arbSysMock = await deploy("ArbSysMock", { from: deployer, log: true });

    const fastBridgeSender = await deploy("FastBridgeSenderMock", {
      from: deployer,
      contract: "FastBridgeSenderMock",
      args: [epochPeriod, fastBridgeReceiver.address, arbSysMock.address],
      log: true,
    }); // nonce+0

    const klerosCore = await deployments.get("KlerosCore");
    const receiverGateway = await deployments.get("ForeignGatewayOnEthereum");
    const receiverChainId = 31337;

    const senderGateway = await deploy("HomeGatewayToEthereum", {
      from: deployer,
      contract: "HomeGateway",
      args: [deployer, klerosCore.address, fastBridgeSender.address, receiverGateway.address, receiverChainId],
      gasLimit: 4000000,
      log: true,
    }); // nonce+1

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

    const fastBridgeSender = await deploy("FastBridgeSender", {
      from: deployer,
      contract: "FastBridgeSender",
      args: [epochPeriod, fastBridgeReceiver.address],
      log: true,
    }); // nonce+0

    const klerosCore = await deployments.get("KlerosCore");
    const ReceiverGateway = await hre.companionNetworks.receiver.deployments.get("ForeignGatewayOnEthereum");
    const ReceiverChainId = Number(await hre.companionNetworks.receiver.getChainId());
    const senderGateway = await deploy("HomeGatewayToEthereum", {
      from: deployer,
      contract: "HomeGateway",
      args: [deployer, klerosCore.address, fastBridgeSender.address, ReceiverGateway.address, ReceiverChainId],
      log: true,
    }); // nonce+
  };

  // ----------------------------------------------------------------------------------------------
  if (chainId === 31337) {
    await hardhatDeployer();
  } else {
    await liveDeployer();
  }
};

deploySenderGateway.tags = ["SenderChain", "SenderGateway"];
deploySenderGateway.skip = async ({ getChainId }) => !SENDER_CHAIN_IDS.includes(Number(await getChainId()));

export default deploySenderGateway;

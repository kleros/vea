import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const SENDER_CHAIN_IDS = [42161, 421613]; // ArbOne, ArbiGoerli
const epochPeriod = 86400; // 24 hours

// TODO: use deterministic deployments
const deploySenderGateway: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy, execute } = deployments;
  const chainId = Number(await getChainId());

  const deployer = (await getNamedAccounts()).deployer;
  console.log("deployer: %s", deployer);

  // ----------------------------------------------------------------------------------------------

  const fastBridgeReceiver = await hre.companionNetworks.receiver_gnosis.deployments.get("FastBridgeReceiverOnGnosis");

  const fastBridgeSender = await deploy("FastBridgeSender", {
    from: deployer,
    contract: "FastBridgeSender",
    args: [epochPeriod, fastBridgeReceiver.address],
    log: true,
  });

  const ReceiverGateway = await hre.companionNetworks.receiver_gnosis.deployments.get("ReceiverGatewayOnGnosis");
  const ReceiverChainId = Number(await hre.companionNetworks.receiver_gnosis.getChainId());
  const senderGateway = await deploy("SenderGatewayToGnosis", {
    from: deployer,
    contract: "SenderGatewayMock",
    args: [fastBridgeSender.address, ReceiverGateway.address, ReceiverChainId],
    log: true,
  });
};

deploySenderGateway.tags = ["SenderChain", "SenderGateway", "Gnosis"];
deploySenderGateway.skip = async ({ getChainId }) => !SENDER_CHAIN_IDS.includes(Number(await getChainId()));
deploySenderGateway.runAtTheEnd = true;

export default deploySenderGateway;

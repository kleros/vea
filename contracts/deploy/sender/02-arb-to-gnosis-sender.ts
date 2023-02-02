import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const SENDER_CHAIN_IDS = [42161, 421613]; // ArbOne, ArbiGoerli
const epochPeriod = 86400; // 24 hours

// TODO: use deterministic deployments
const deploySender: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy, execute } = deployments;
  const chainId = Number(await getChainId());

  const deployer = (await getNamedAccounts()).deployer;
  console.log("deployer: %s", deployer);

  // ----------------------------------------------------------------------------------------------

  const fastBridgeReceiver = await hre.companionNetworks.receiver.deployments.get("FastBridgeReceiverOnGnosis");

  await deploy("FastBridgeSenderToGnosis", {
    from: deployer,
    contract: "FastBridgeSender",
    args: [epochPeriod, fastBridgeReceiver.address],
    log: true,
  });
};

deploySender.tags = ["ArbToGnosisSender"];
deploySender.skip = async ({ getChainId }) => !SENDER_CHAIN_IDS.includes(Number(await getChainId()));
deploySender.runAtTheEnd = true;

export default deploySender;

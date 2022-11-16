import { parseEther } from "ethers/lib/utils";

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import getContractAddress from "../deploy-helpers/getContractAddress";

enum ReceiverChains {
  ETHEREUM_MAINNET = 1,
  ETHEREUM_GOERLI = 5,
  HARDHAT = 31337,
}
const paramsByChainId = {
  1: {
    deposit: parseEther("0.1"),
    epochPeriod: 86400, // 24 hours
    challengePeriod: 14400, // 4 hours
    senderChainId: 42161,
    arbitrumInbox: "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f",
  },
  5: {
    deposit: parseEther("0.1"),
    epochPeriod: 86400, // 24 hours
    challengePeriod: 14400, // 4 hours
    senderChainId: 421613,
    arbitrumInbox: "0x6BEbC4925716945D46F0Ec336D5C2564F419682C",
  },
  31337: {
    deposit: parseEther("0.1"),
    epochPeriod: 86400, // 24 hours
    challengePeriod: 14400, // 4 hours
    senderChainId: 31337,
    arbitrumInbox: "0x00",
  },
};

const deployReceiverGateway: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { ethers, deployments, getNamedAccounts, getChainId, config } = hre;
  const { deploy } = deployments;
  const { providers } = ethers;
  const { hexZeroPad } = hre.ethers.utils;

  // fallback to hardhat node signers on local network
  const deployer = (await getNamedAccounts()).deployer ?? (await hre.ethers.getSigners())[0].address;
  const chainId = Number(await getChainId());
  console.log("deploying to chainId %s with deployer %s", chainId, deployer);

  const senderNetworks = {
    1: config.networks.arbitrum,
    5: config.networks.arbitrumGoerli,
    31337: config.networks.localhost,
  };

  // Hack to predict the deployment address on the sender chain.
  // TODO: use deterministic deployments
  let nonce;
  if (chainId === ReceiverChains.HARDHAT) {
    nonce = await ethers.provider.getTransactionCount(deployer);
    nonce += 5; // SenderGatewayToEthereum deploy tx will be the 6th after this, same network for both sender/receiver.
  } else {
    const senderChainProvider = new providers.JsonRpcProvider(senderNetworks[chainId].url);
    nonce = await senderChainProvider.getTransactionCount(deployer);
    nonce += 1; // SenderGatewayToEthereum deploy tx will the third tx after this on its sender network, so we add two to the current nonce.
  }
  const { deposit, epochPeriod, challengePeriod, senderChainId, arbitrumInbox } = paramsByChainId[chainId];
  const senderChainIdAsBytes32 = hexZeroPad(senderChainId, 32);

  const senderGatewayAddress = getContractAddress(deployer, nonce);
  console.log("calculated future SenderGatewayToEthereum address for nonce %d: %s", nonce, senderGatewayAddress);
  nonce -= 1;

  const fastBridgeSenderAddress = getContractAddress(deployer, nonce);
  console.log("calculated future FastSender for nonce %d: %s", nonce, fastBridgeSenderAddress);

  nonce += 4;

  const inboxAddress = chainId === ReceiverChains.HARDHAT ? getContractAddress(deployer, nonce) : arbitrumInbox;
  console.log("calculated future inboxAddress for nonce %d: %s", nonce, inboxAddress);

  const fastBridgeReceiver = await deploy("FastBridgeReceiverOnEthereum", {
    from: deployer,
    args: [deposit, epochPeriod, challengePeriod, fastBridgeSenderAddress, inboxAddress],
    log: true,
  });

  const ReceiverGateway = await deploy("ReceiverGatewayOnEthereum", {
    from: deployer,
    contract: "ReceiverGateway",
    args: [
      deployer,
      fastBridgeReceiver.address,
      [ethers.BigNumber.from(10).pow(17)],
      senderGatewayAddress,
      senderChainIdAsBytes32,
    ],
    gasLimit: 4000000,
    log: true,
  });
};

deployReceiverGateway.tags = ["ReceiverChain", "ReceiverGateway"];
deployReceiverGateway.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  return !ReceiverChains[chainId];
};

export default deployReceiverGateway;

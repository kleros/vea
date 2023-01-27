import { parseEther } from "ethers/lib/utils";

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import getContractAddress from "../../deploy-helpers/getContractAddress";

enum ReceiverChains {
  GNOSIS_CHIADO = 10200,
  GNOSIS_MAINNET = 100,
}
const paramsByChainId = {
  10200: {
    deposit: parseEther("0.0001"),
    epochPeriod: 86400, // 24 hours
    challengePeriod: 14400, // 4 hours
    senderChainId: 421613,
    amb: "0x99Ca51a3534785ED619f46A79C7Ad65Fa8d85e7a",
  },
  100: {
    deposit: parseEther("0.1"),
    epochPeriod: 86400, // 24 hours
    challengePeriod: 14400, // 4 hours
    senderChainId: 421613,
    amb: "0x75Df5AF045d91108662D8080fD1FEFAd6aA0bb59",
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
    100: config.networks.arbitrum,
    10200: config.networks.arbitrumGoerli,
  };

  // Hack to predict the deployment address on the sender chain.
  // TODO: use deterministic deployments
  let nonce;
  const senderChainProvider = new providers.JsonRpcProvider(senderNetworks[chainId].url);
  nonce = await senderChainProvider.getTransactionCount(deployer);
  nonce += 1; // SenderGateway deploy tx will the third tx after this on its sender network, so we add two to the current nonce.

  const { deposit, epochPeriod, challengePeriod, senderChainId, amb } = paramsByChainId[chainId];
  const senderChainIdAsBytes32 = hexZeroPad(senderChainId, 32);

  const senderGatewayAddress = getContractAddress(deployer, nonce);
  console.log("calculated future SenderGateway address for nonce %d: %s", nonce, senderGatewayAddress);
  nonce -= 1;

  const fastBridgeSenderAddress = getContractAddress(deployer, nonce);
  console.log("calculated future FastSender for nonce %d: %s", nonce, fastBridgeSenderAddress);
  nonce += 4;

  const fastBridgeReceiver = await deploy("FastBridgeReceiverOnGnosis", {
    from: deployer,
    args: [deposit, epochPeriod, challengePeriod, fastBridgeSenderAddress, amb],
    log: true,
  });

  const ReceiverGateway = await deploy("ReceiverGatewayOnGnosis", {
    from: deployer,
    contract: "ReceiverGatewayMock",
    args: [fastBridgeReceiver.address, senderGatewayAddress, senderChainId],
    gasLimit: 4000000,
    log: true,
  });
};

deployReceiverGateway.tags = ["ReceiverChain", "ReceiverGateway", "Arbitrum"];
deployReceiverGateway.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !ReceiverChains[chainId];
};

export default deployReceiverGateway;

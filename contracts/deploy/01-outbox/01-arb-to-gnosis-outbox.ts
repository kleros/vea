import { parseEther } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import getContractAddress from "../../deploy-helpers/getContractAddress";
import { ethers } from "hardhat";

enum ReceiverChains {
  GNOSIS_MAINNET = 100,
  GNOSIS_CHIADO = 10200,
  HARDHAT = 31337,
}
const paramsByChainId = {
  GNOSIS_MAINNET: {
    deposit: parseEther("20000"), // 200,000 xDAI budget to start, enough for 10 days till timeout
    // Average happy path wait time is 31 hours
    epochPeriod: 43200, // 12 hours
    challengePeriod: 90000, // 24 hours (sequencer backdating) + 1 hour buffer
    numEpochTimeout: 20, // 10 days
    epochClaimWindow: 3, // 24 hours (sequencer backdating) + 1 hour buffer
    senderChainId: 421613,
    amb: "0x75Df5AF045d91108662D8080fD1FEFAd6aA0bb59",
  },
  GNOSIS_CHIADO: {
    deposit: parseEther("5"), // 120 xDAI budget for timeout
    // Average happy path wait time is 22.5 mins, assume no censorship
    epochPeriod: 600, // 15 min
    challengePeriod: 600, // 15 min (assume no sequencer backdating)
    numEpochTimeout: 24, // 6 hours
    epochClaimWindow: 2,
    senderChainId: 421613,
    amb: "0x99Ca51a3534785ED619f46A79C7Ad65Fa8d85e7a",
  },
  HARDHAT: {
    deposit: parseEther("5"), // 120 xDAI budget for timeout
    // Average happy path wait time is 22.5 mins, assume no censorship
    epochPeriod: 600, // 15 min
    challengePeriod: 600, // 15 min (assume no sequencer backdating)
    numEpochTimeout: 24, // 6 hours
    epochClaimWindow: 2,
    senderChainId: 421613,
    amb: ethers.constants.AddressZero,
  },
};

const deployOutbox: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { ethers, deployments, getNamedAccounts, getChainId, config } = hre;
  const { deploy } = deployments;
  const { providers } = ethers;

  // fallback to hardhat node signers on local network
  const deployer = (await getNamedAccounts()).deployer ?? (await hre.ethers.getSigners())[0].address;
  const chainId = Number(await getChainId());
  console.log("deploying to chainId %s with deployer %s", chainId, deployer);

  const senderNetworks = {
    GNOSIS_MAINNET: config.networks.arbitrum,
    GNOSIS_CHIADO: config.networks.arbitrumGoerli,
    HARDHAT: config.networks.localhost,
  };

  const { deposit, epochPeriod, challengePeriod, numEpochTimeout, epochClaimWindow, senderChainId, amb } =
    paramsByChainId[ReceiverChains[chainId]];

  // Hack to predict the deployment address on the sender chain.
  // TODO: use deterministic deployments

  // ----------------------------------------------------------------------------------------------
  const hardhatDeployer = async () => {
    let nonce = await ethers.provider.getTransactionCount(deployer);
    nonce += 3; // SenderGatewayToEthereum deploy tx will be the 5th after this, same network for both sender/receiver.

    const veaInboxAddress = getContractAddress(deployer, nonce);
    console.log("calculated future veaInbox for nonce %d: %s", nonce, veaInboxAddress);

    const veaOutboxGnosis = await deploy("VeaOutboxGnosisMock", {
      from: deployer,
      args: [deposit, epochPeriod, challengePeriod, numEpochTimeout, epochClaimWindow, veaInboxAddress, amb],
      log: true,
    });
  };

  // ----------------------------------------------------------------------------------------------
  const liveDeployer = async () => {
    console.log(config.networks);
    const senderChainProvider = new providers.JsonRpcProvider(senderNetworks[ReceiverChains[chainId]].url);
    let nonce = await senderChainProvider.getTransactionCount(deployer);

    const veaInboxAddress = getContractAddress(deployer, nonce);
    console.log("calculated future veaInbox for nonce %d: %s", nonce, veaInboxAddress);

    await deploy("VeaOutboxArbToGnosis", {
      from: deployer,
      args: [deposit, epochPeriod, challengePeriod, numEpochTimeout, epochClaimWindow, veaInboxAddress, amb],
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

deployOutbox.tags = ["ArbToGnosisOutbox"];
deployOutbox.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !ReceiverChains[chainId];
};

export default deployOutbox;

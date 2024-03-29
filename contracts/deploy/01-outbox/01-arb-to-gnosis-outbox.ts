import { parseEther } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import getContractAddress from "../../deploy-helpers/getContractAddress";
import { ethers } from "hardhat";

enum ReceiverChains {
  GNOSIS_MAINNET = 100,
  HARDHAT = 31337,
}

const paramsByChainId = {
  GNOSIS_MAINNET: {
    deposit: parseEther("20000"), // 200,000 xDAI budget to start, enough for 10 days till timeout
    // Average happy path wait time is 42 hours (36 - 48 hours)
    epochPeriod: 43200, // 12 hours
    claimDelay: 108000, // 30 hours (24 hours sequencer backdating + 6 hour buffer)
    challengePeriod: 21600, // 6 hours
    numEpochTimeout: 42, // 21 days
    amb: "0x75Df5AF045d91108662D8080fD1FEFAd6aA0bb59",
    maxMissingBlocks: 709, // 709 in 4320 slots, assumes 20% honest validators
    senderChainId: 421613,
  },
  HARDHAT: {
    deposit: parseEther("5"), // 120 xDAI budget for timeout
    // Average happy path wait time is 22.5 mins, assume no censorship
    epochPeriod: 600, // 15 min
    challengePeriod: 600, // 15 min (assume no sequencer backdating)
    numEpochTimeout: 24, // 6 hours
    claimDelay: 2,
    amb: ethers.constants.AddressZero,
    routerAddress: ethers.constants.AddressZero,
    maxMissingBlocks: 10000000000000,
    senderChainId: 421613,
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
    HARDHAT: config.networks.localhost,
  };

  const routerNetworks = {
    GNOSIS_MAINNET: config.networks.mainnet,
    HARDHAT: config.networks.localhost,
  };

  const { deposit, epochPeriod, challengePeriod, numEpochTimeout, claimDelay, amb, maxMissingBlocks } =
    paramsByChainId[ReceiverChains[chainId]];

  // Hack to predict the deployment address on the sender chain.
  // TODO: use deterministic deployments

  // ----------------------------------------------------------------------------------------------
  const hardhatDeployer = async () => {
    let nonce = await ethers.provider.getTransactionCount(deployer);
    nonce += 3; // SenderGatewayToEthereum deploy tx will be the 5th after this, same network for both sender/receiver.

    const veaInboxAddress = getContractAddress(deployer, nonce);
    console.log("calculated future veaInbox for nonce %d: %s", nonce, veaInboxAddress);

    await deploy("VeaOutboxGnosisMock", {
      from: deployer,
      args: [
        deposit,
        epochPeriod,
        challengePeriod,
        numEpochTimeout,
        claimDelay,
        veaInboxAddress,
        amb,
        ethers.constants.AddressZero,
        maxMissingBlocks,
      ],
      log: true,
    });
  };

  // ----------------------------------------------------------------------------------------------
  const liveDeployer = async () => {
    const senderChainProvider = new providers.JsonRpcProvider(senderNetworks[ReceiverChains[chainId]].url);
    let nonce = await senderChainProvider.getTransactionCount(deployer);

    const routerChainProvider = new providers.JsonRpcProvider(routerNetworks[ReceiverChains[chainId]].url);
    let nonceRouter = await routerChainProvider.getTransactionCount(deployer);

    const veaInboxAddress = getContractAddress(deployer, nonce);
    console.log("calculated future veaInbox for nonce %d: %s", nonce, veaInboxAddress);

    const routerAddress = getContractAddress(deployer, nonceRouter);
    console.log("calculated future router for nonce %d: %s", nonce, routerAddress);

    const txn = await deploy("VeaOutboxArbToGnosis", {
      from: deployer,
      args: [deposit, epochPeriod, challengePeriod, numEpochTimeout, claimDelay, amb, routerAddress, maxMissingBlocks],
      log: true,
    });

    console.log("VeaOutboxArbToGnosis deployed to:", txn.address);
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

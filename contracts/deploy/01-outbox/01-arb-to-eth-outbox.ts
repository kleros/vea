import { parseEther } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import getContractAddress from "../../deploy-helpers/getContractAddress";
import { ethers } from "hardhat";

enum ReceiverChains {
  ETHEREUM_MAINNET = 1,
  ETHEREUM_GOERLI = 5,
  HARDHAT = 31337,
}

const paramsByChainId = {
  ETHEREUM_MAINNET: {
    deposit: parseEther("12"), // ~1100 ETH budget, enough for 8 days of challenges
    // bridging speed is 29 - 31 hours.
    epochPeriod: 7200, // 2 hours
    minChallengePeriod: 10800, // 3 hours
    numEpochTimeout: 252, // 21 days
    maxMissingBlocks: 49, // 49 in 900 slots, assumes 10% non-censoring validators
    arbitrumBridge: "0x8315177aB297bA92A06054cE80a67Ed4DBd7ed3a", // https://developer.arbitrum.io/useful-addresses,
  },
  ETHEREUM_GOERLI: {
    deposit: parseEther("1"), // ~100 ETH budget to start, enough for 8 days of challenges
    // bridging speed is 29 - 31 hours.
    epochPeriod: 7200, // 2 hours
    minChallengePeriod: 10800, // 3 hours
    numEpochTimeout: 1000000, // never
    maxMissingBlocks: 1000000, // any, goerli network performance is poor, so can't use the censorship test well
    arbitrumBridge: "0xaf4159A80B6Cc41ED517DB1c453d1Ef5C2e4dB72", // https://developer.arbitrum.io/useful-addresses
  },
  HARDHAT: {
    deposit: parseEther("10"),
    epochPeriod: 1800, // 30 min
    minChallengePeriod: 1800, // 30 min
    numEpochTimeout: 10000000000000, // never
    maxMissingBlocks: 10,
    arbitrumBridge: ethers.constants.AddressZero,
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
    ETHEREUM_MAINNET: config.networks.arbitrum,
    ETHEREUM_GOERLI: config.networks.arbitrumGoerli,
    HARDHAT: config.networks.localhost,
  };

  const { deposit, epochPeriod, minChallengePeriod, numEpochTimeout, maxMissingBlocks, arbitrumBridge } =
    paramsByChainId[ReceiverChains[chainId]];

  // Hack to predict the deployment address on the sender chain.
  // TODO: use deterministic deployments

  // ----------------------------------------------------------------------------------------------
  const hardhatDeployer = async () => {
    let nonce = await ethers.provider.getTransactionCount(deployer);

    const arbSysAddress = getContractAddress(deployer, nonce + 5);
    console.log("calculated future arbSysAddress address for nonce %d: %s", nonce, arbSysAddress);

    const veaInboxAddress = getContractAddress(deployer, nonce + 6);
    console.log("calculated future VeaInbox for nonce %d: %s", nonce, veaInboxAddress);

    const senderGatewayAddress = getContractAddress(deployer, nonce + 7);
    console.log("calculated future SenderGatewayToEthereum address for nonce %d: %s", nonce, senderGatewayAddress);

    const outbox = await deploy("OutboxMock", {
      from: deployer,
      args: [veaInboxAddress],
      log: true,
    });

    const sequencerInbox = await deploy("SequencerInboxMock", {
      from: deployer,
      args: [86400],
      log: true,
    });

    const bridge = await deploy("BridgeMock", {
      from: deployer,
      args: [outbox.address, sequencerInbox.address],
      log: true,
    });

    const veaOutbox = await deploy("VeaOutbox", {
      from: deployer,
      contract: "VeaOutboxArbToEthDevnet",
      args: [
        deposit,
        epochPeriod,
        minChallengePeriod,
        numEpochTimeout,
        veaInboxAddress,
        bridge.address,
        maxMissingBlocks,
      ],
      log: true,
    });

    await deploy("ReceiverGateway", {
      from: deployer,
      contract: "ReceiverGatewayMock",
      args: [veaOutbox.address, senderGatewayAddress],
      gasLimit: 4000000,
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

    if (chainId)
      await deploy("VeaOutboxArbToEth" + (chainId === 1 ? "" : "Testnet"), {
        from: deployer,
        contract: "VeaOutboxArbToEth",
        args: [
          deposit,
          epochPeriod,
          minChallengePeriod,
          numEpochTimeout,
          veaInboxAddress,
          arbitrumBridge,
          maxMissingBlocks,
        ],
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

deployOutbox.tags = ["ArbToEthOutbox"];
deployOutbox.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !ReceiverChains[chainId];
};

export default deployOutbox;

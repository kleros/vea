import { parseEther } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import getContractAddress from "../../deploy-helpers/getContractAddress";
import { ethers } from "hardhat";

enum ReceiverChains {
  ETHEREUM_MAINNET = 1,
  HARDHAT = 31337,
}
const paramsByChainId = {
  ETHEREUM_MAINNET: {
    deposit: parseEther("20"), // 1500 ETH budget to start, enough for 21 days till timeout
    // Average happy path wait time is 45 hours (42, 48 hours)
    epochPeriod: 21600, // 6 hours
    challengePeriod: 86400, // 24 hours
    numEpochTimeout: 84, // 21 days
    maxMissingBlocks: 601, // 601 in 7200 slots, assumes 10% non-censoring validators
    arbitrumBridge: "0x8315177aB297bA92A06054cE80a67Ed4DBd7ed3a", // https://developer.arbitrum.io/useful-addresses
  },
  HARDHAT: {
    deposit: parseEther("10"), // 120 eth budget for timeout
    // Average happy path wait time is 45 mins, assume no censorship
    epochPeriod: 1800, // 30 min
    claimDelay: 0, // 30 hours (24 hours sequencer backdating + 6 hour buffer)
    challengePeriod: 1800, // 30 min (assume no sequencer backdating)
    numEpochTimeout: 10000000000000, // 6 hours
    senderChainId: 31337,
    maxMissingBlocks: 10000000000000,
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
    HARDHAT: config.networks.localhost,
  };

  const { deposit, epochPeriod, challengePeriod, numEpochTimeout, claimDelay, maxMissingBlocks, arbitrumBridge } =
    paramsByChainId[ReceiverChains[chainId]];

  // Hack to predict the deployment address on the sender chain.
  // TODO: use deterministic deployments

  // ----------------------------------------------------------------------------------------------
  const hardhatDeployer = async () => {
    let nonce = await ethers.provider.getTransactionCount(deployer);
    nonce += 4; // SenderGatewayToEthereum deploy tx will be the 5th after this, same network for both sender/receiver.

    const senderGatewayAddress = getContractAddress(deployer, nonce);
    console.log("calculated future SenderGatewayToEthereum address for nonce %d: %s", nonce, senderGatewayAddress);
    nonce -= 2;

    const arbSysAddress = getContractAddress(deployer, nonce);
    console.log("calculated future arbSysAddress address for nonce %d: %s", nonce, arbSysAddress);
    nonce += 1;

    const veaInboxAddress = getContractAddress(deployer, nonce);
    console.log("calculated future VeaInbox for nonce %d: %s", nonce, veaInboxAddress);
    nonce += 3;

    const bridgeAddress = getContractAddress(deployer, nonce);
    console.log("calculated future inboxAddress for nonce %d: %s", nonce, bridgeAddress);

    const veaOutbox = await deploy("VeaOutbox", {
      from: deployer,
      contract: "VeaOutboxMockArbToEth",
      args: [
        arbSysAddress,
        deposit,
        epochPeriod,
        challengePeriod,
        numEpochTimeout,
        claimDelay,
        veaInboxAddress,
        bridgeAddress,
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
      await deploy("VeaOutboxArbToEth", {
        from: deployer,
        contract: "VeaOutboxArbToEth",
        args: [
          deposit,
          epochPeriod,
          challengePeriod,
          numEpochTimeout,
          claimDelay,
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
  return !(chainId === 1 || chainId === 31337);
};

export default deployOutbox;

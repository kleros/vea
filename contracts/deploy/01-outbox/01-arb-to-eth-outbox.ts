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
    deposit: parseEther("20"), // 1000 ETH budget to start, enough for 21 days till timeout
    // Average happy path wait time is 42 hours (36, 48 hours)
    epochPeriod: 43200, // 12 hours
    claimDelay: 108000, // 30 hours (24 hours sequencer backdating + 6 hour buffer)
    challengePeriod: 21600, // 6 hours
    numEpochTimeout: 42, // 21 days
    maxMissingBlocks: 108, // 108 in 1800 slots
    senderChainId: 42161,
    arbitrumInbox: "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f",
  },
  /*
  // if maxTimeVariation on seuqencer is 4 hours. . .
  ETHEREUM_MAINNET: {
    deposit: parseEther("10"), // 1000 ETH budget to start, enough for 21 days till timeout
    // Average happy path wait time is 12 hours (9, 15 hours)
    epochPeriod: 43200, // 6 hours
    claimDelay: 21600, // 6 hours (4 hours sequencer backdating + 2 hour buffer)
    challengePeriod: 21600, // 3 hours
    numEpochTimeout: 42, // 21 days
    maxMissingBlocks: 40, // 900 in 1800 slots
    senderChainId: 42161,
    arbitrumInbox: "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f",
  },*/
  HARDHAT: {
    deposit: parseEther("10"), // 120 eth budget for timeout
    // Average happy path wait time is 45 mins, assume no censorship
    epochPeriod: 1800, // 30 min
    claimDelay: 0, // 30 hours (24 hours sequencer backdating + 6 hour buffer)
    challengePeriod: 1800, // 30 min (assume no sequencer backdating)
    numEpochTimeout: 10000000000000, // 6 hours
    senderChainId: 31337,
    maxMissingBlocks: 10000000000000,
    arbitrumInbox: ethers.constants.AddressZero,
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

  const { deposit, epochPeriod, challengePeriod, numEpochTimeout, claimDelay, maxMissingBlocks, arbitrumInbox } =
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
    nonce += 4;

    const inboxAddress = getContractAddress(deployer, nonce);
    console.log("calculated future inboxAddress for nonce %d: %s", nonce, inboxAddress);

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
        inboxAddress,
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
          arbitrumInbox,
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

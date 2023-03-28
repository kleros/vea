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
    deposit: parseEther("100"), // 2000 ETH budget to start, enough for 10 days till timeout
    // Average happy path wait time is 31 hours
    epochPeriod: 43200, // 12 hours
    challengePeriod: 90000, // 24 hours (sequencer backdating) + 1 hour buffer
    numEpochTimeout: 20, // 10 days
    epochClaimWindow: 3, // 24 hours (sequencer backdating) + 1 hour buffer
    senderChainId: 42161,
    arbitrumInbox: "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f",
  },
  ETHEREUM_GOERLI: {
    deposit: parseEther("10"), // 120 eth budget for timeout
    // Average happy path wait time is 45 mins, assume no censorship
    epochPeriod: 1800, // 30 min
    challengePeriod: 1800, // 30 min (assume no sequencer backdating)
    numEpochTimeout: 12, // 6 hours
    epochClaimWindow: 2,
    senderChainId: 421613,
    arbitrumInbox: "0x6BEbC4925716945D46F0Ec336D5C2564F419682C",
  },
  HARDHAT: {
    deposit: parseEther("10"), // 120 eth budget for timeout
    // Average happy path wait time is 45 mins, assume no censorship
    epochPeriod: 1800, // 30 min
    challengePeriod: 1800, // 30 min (assume no sequencer backdating)
    numEpochTimeout: 12, // 6 hours
    epochClaimWindow: 2,
    senderChainId: 31337,
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

  const { deposit, epochPeriod, challengePeriod, numEpochTimeout, epochClaimWindow, senderChainId, arbitrumInbox } =
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
      contract: "VeaOutboxMock",
      args: [
        arbSysAddress,
        deposit,
        epochPeriod,
        challengePeriod,
        numEpochTimeout,
        epochClaimWindow,
        veaInboxAddress,
        inboxAddress,
      ],
      log: true,
    });

    await deploy("ReceiverGateway", {
      from: deployer,
      contract: "ReceiverGatewayMock",
      args: [veaOutbox.address, senderGatewayAddress, senderChainId],
      gasLimit: 4000000,
      log: true,
    });
  };

  // ----------------------------------------------------------------------------------------------
  const liveDeployer = async () => {
    console.log(config.networks);
    const senderChainProvider = new providers.JsonRpcProvider(senderNetworks[ReceiverChains[chainId]].url);
    let nonce = await senderChainProvider.getTransactionCount(deployer);
    nonce += 1; // SenderGatewayToEthereum deploy tx will the third tx after this on its sender network, so we add two to the current nonce.

    const senderGatewayAddress = getContractAddress(deployer, nonce);
    console.log("calculated future SenderGatewayToEthereum address for nonce %d: %s", nonce, senderGatewayAddress);
    nonce -= 1;

    const veaInboxAddress = getContractAddress(deployer, nonce);
    console.log("calculated future veaInbox for nonce %d: %s", nonce, veaInboxAddress);
    nonce += 4;

    const inboxAddress = arbitrumInbox;
    console.log("calculated future inboxAddress for nonce %d: %s", nonce, inboxAddress);

    const veaOutbox = await deploy("VeaOutbox", {
      from: deployer,
      contract: "VeaOutbox",
      args: [deposit, epochPeriod, challengePeriod, numEpochTimeout, epochClaimWindow, veaInboxAddress, inboxAddress],
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

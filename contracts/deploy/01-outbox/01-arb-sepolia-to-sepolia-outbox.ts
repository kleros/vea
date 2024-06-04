import { parseEther } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import getContractAddress from "../../deploy-helpers/getContractAddress";
import { ethers } from "hardhat";

enum ReceiverChains {
  ETHEREUM_SEPOLIA = 11155111,
  HARDHAT = 31337,
}

const paramsByChainId = {
  ETHEREUM_SEPOLIA: {
    deposit: parseEther("0.001"),
    // Average happy path wait time is 1 hour (30 min, 90 min), happy path only
    epochPeriod: 1800, // 30 min
    minChallengePeriod: 0, // 0 min
    numEpochTimeout: 10000000000000, // never
    maxMissingBlocks: 10000000000000,
    arbitrumBridge: "0x38f918D0E9F1b721EDaA41302E399fa1B79333a9", // https://developer.arbitrum.io/useful-addresses
  },
  HARDHAT: {
    deposit: parseEther("10"), // 120 eth budget for timeout
    // Average happy path wait time is 45 mins, assume no censorship
    epochPeriod: 600, // 10 min
    minChallengePeriod: 600, // 10 min (assume no sequencer backdating)
    numEpochTimeout: 10000000000000, // 6 hours
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
    ETHEREUM_SEPOLIA: config.networks.arbitrumSepolia,
    HARDHAT: config.networks.localhost,
  };

  const { deposit, epochPeriod, numEpochTimeout, minChallengePeriod, maxMissingBlocks, arbitrumBridge } =
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
    console.log("calculated future bridgeAddress for nonce %d: %s", nonce, bridgeAddress);

    const veaOutbox = await deploy("VeaOutbox", {
      from: deployer,
      contract: "VeaOutboxMockArbToEth",
      args: [
        arbSysAddress,
        deposit,
        epochPeriod,
        minChallengePeriod,
        numEpochTimeout,
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
    const senderChainProvider = new providers.JsonRpcProvider(senderNetworks[ReceiverChains[chainId]].url);
    let nonce = await senderChainProvider.getTransactionCount(deployer);

    const veaInboxAddress = getContractAddress(deployer, nonce);
    console.log("calculated future veaInbox for nonce %d: %s", nonce, veaInboxAddress);

    if (chainId)
      await deploy("VeaOutboxArbToEthDevnet", {
        from: deployer,
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

deployOutbox.tags = ["ArbSepoliaToSepoliaOutbox"];
deployOutbox.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !ReceiverChains[chainId];
};

export default deployOutbox;

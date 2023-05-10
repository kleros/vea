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
  GNOSIS_CHIADO: {
    deposit: parseEther("5"), // 120 xDAI budget for timeout
    // Average happy path wait time is 22.5 mins, assume no censorship
    epochPeriod: 600, // 15 min
    challengePeriod: 600, // 15 min (assume no sequencer backdating)
    numEpochTimeout: 24, // 6 hours
    claimDelay: 2,
    amb: "0x99Ca51a3534785ED619f46A79C7Ad65Fa8d85e7a",
    routerAddress: ethers.constants.AddressZero, // TODO: FIX ME, address on Goerli
    maxMissingBlocks: 10000000000000,
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
    GNOSIS_CHIADO: config.networks.arbitrumGoerli,
    HARDHAT: config.networks.localhost,
  };

  const { deposit, epochPeriod, challengePeriod, numEpochTimeout, claimDelay, amb, routerAddress, maxMissingBlocks } =
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
        routerAddress,
        maxMissingBlocks,
      ],
      log: true,
    });
  };

  // ----------------------------------------------------------------------------------------------
  const liveDeployer = async () => {
    const gasOptions = {
      maxFeePerGas: ethers.utils.parseUnits("1", "gwei"),
      maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei"),
    };

    const senderChainProvider = new providers.JsonRpcProvider(senderNetworks[ReceiverChains[chainId]].url);
    let nonce = await senderChainProvider.getTransactionCount(deployer);

    const veaInboxAddress = getContractAddress(deployer, nonce);
    console.log("calculated future veaInbox for nonce %d: %s", nonce, veaInboxAddress);

    await deploy("VeaOutboxArbToGnosisDevnet", {
      from: deployer,
      args: [deposit, epochPeriod, challengePeriod, numEpochTimeout, claimDelay, amb, routerAddress, maxMissingBlocks],
      log: true,
      ...gasOptions,
    });
  };

  // ----------------------------------------------------------------------------------------------
  if (chainId === 31337) {
    await hardhatDeployer();
  } else {
    await liveDeployer();
  }
};

deployOutbox.tags = ["ArbGoerliToChiadoOutbox"];
deployOutbox.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !ReceiverChains[chainId];
};

export default deployOutbox;

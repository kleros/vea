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
    deposit: parseEther("2000"), // ~ 400k xDAI budget to start, enough for 8 days of challenges
    // bridging speed is 28 - 29 hours.
    epochPeriod: 3600, // 1 hours
    minChallengePeriod: 10800, // 3 hours
    numEpochTimeout: 504, // 21 days
    maxMissingBlocks: 345, // 345 in 2160 slots, assumes 20% non-censoring validators
    routerChainId: 1,
    amb: "0x75Df5AF045d91108662D8080fD1FEFAd6aA0bb59",
    sequencerLimit: 86400, // 24 hours
  },
  GNOSIS_CHIADO: {
    deposit: parseEther("1"), // ~200 xDAI budget to start, enough for 8 days of challenges
    // bridging speed is 28 - 29 hours.
    epochPeriod: 3600, // 1 hours
    minChallengePeriod: 10800, // 3 hours
    numEpochTimeout: 1000000, // never
    maxMissingBlocks: 1000000, // any
    routerChainId: 5,
    amb: "0x99Ca51a3534785ED619f46A79C7Ad65Fa8d85e7a",
    sequencerLimit: 86400, // 24 hours
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
    routerChainId: 31337,
    sequencerLimit: 86400, // 24 hours
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

  const routerNetworks = {
    GNOSIS_MAINNET: config.networks.mainnet,
    GNOSIS_CHIADO: config.networks.goerli,
    HARDHAT: config.networks.localhost,
  };

  const {
    deposit,
    epochPeriod,
    routerChainId,
    minChallengePeriod,
    numEpochTimeout,
    amb,
    maxMissingBlocks,
    sequencerLimit,
  } = paramsByChainId[ReceiverChains[chainId]];

  // Hack to predict the deployment address on the sender chain.
  // TODO: use deterministic deployments

  // ----------------------------------------------------------------------------------------------
  const hardhatDeployer = async () => {
    let nonce = await ethers.provider.getTransactionCount(deployer);
    nonce += 4; // SenderGatewayToEthereum deploy tx will be the 5th after this, same network for both sender/receiver.

    const routerAddress = getContractAddress(deployer, nonce);
    console.log("calculated future router for nonce %d: %s", nonce, routerAddress);

    await deploy("VeaOutboxGnosisMock", {
      from: deployer,
      args: [
        deposit,
        epochPeriod,
        minChallengePeriod,
        numEpochTimeout,
        amb,
        ethers.constants.AddressZero,
        sequencerLimit,
        maxMissingBlocks,
        routerChainId,
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

    const txn = await deploy("VeaOutboxArbToGnosis" + (chainId === 100 ? "" : "Testnet"), {
      contract: "VeaOutboxArbToGnosis",
      from: deployer,
      args: [
        deposit,
        epochPeriod,
        minChallengePeriod,
        numEpochTimeout,
        amb,
        routerAddress,
        sequencerLimit,
        maxMissingBlocks,
        routerChainId,
      ],
      log: true,
      gasPrice: ethers.utils.parseUnits("1", "gwei"), // chiado rpc response underprices gas
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

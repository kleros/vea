import { parseEther } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import getContractAddress from "../../deploy-helpers/getContractAddress";
import { ethers } from "hardhat";

enum ReceiverChains {
  ARBITRUM_GOERLI = 421613,
  HARDHAT = 31337,
}

const paramsByChainId = {
  ARBITRUM_GOERLI: {
    deposit: parseEther("0.1"),
    epochPeriod: 1800, // 30 min
    challengePeriod: 0, // 30 min
    numEpochTimeout: 10000000000000, // never
    sequencerDelayLimit: 86400,
    sequencerFutureLimit: 3600,
    maxMissingBlocks: 10000000000000,
    routerChainId: 5,
  },
  HARDHAT: {
    deposit: parseEther("1"),
    epochPeriod: 600, // 10 min
    challengePeriod: 600, // 10 min
    numEpochTimeout: 24, // 6 hours
    amb: ethers.constants.AddressZero,
    sequencerDelayLimit: 86400,
    sequencerFutureLimit: 3600,
    maxMissingBlocks: 10000000000000,
    routerChainId: 31337,
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
    ARBITRUM_GOERLI: config.networks.chiado,
    HARDHAT: config.networks.localhost,
  };

  const routerNetworks = {
    ARBITRUM_GOERLI: config.networks.goerli,
    HARDHAT: config.networks.localhost,
  };

  const { deposit, epochPeriod, challengePeriod, numEpochTimeout, sequencerDelayLimit, sequencerFutureLimit } =
    paramsByChainId[ReceiverChains[chainId]];

  // Hack to predict the deployment address on the sender chain.
  // TODO: use deterministic deployments

  // ----------------------------------------------------------------------------------------------
  const hardhatDeployer = async () => {
    let nonce = await ethers.provider.getTransactionCount(deployer);
    nonce += 3; // SenderGatewayToEthereum deploy tx will be the 5th after this, same network for both sender/receiver.

    const veaInboxAddress = getContractAddress(deployer, nonce);
    console.log("calculated future veaInbox for nonce %d: %s", nonce, veaInboxAddress);

    // TODO outbox mock
    /*
    await deploy("VeaOutboxGnosisMock", {
      from: deployer,
      args: [
        deposit,
        epochPeriod,
        challengePeriod,
        numEpochTimeout,
        amb,
        ethers.constants.AddressZero,
        sequencerLimit,
        maxMissingBlocks,
        routerChainId,
        WETH,
        maxClaimDelayEpochs
      ],
      log: true,
    });
    */
  };

  // ----------------------------------------------------------------------------------------------
  const liveDeployer = async () => {
    const gasOptions = {
      maxFeePerGas: ethers.utils.parseUnits("1", "gwei"),
      maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei"),
    };

    const senderChainProvider = new providers.JsonRpcProvider(senderNetworks[ReceiverChains[chainId]].url);
    let nonce = await senderChainProvider.getTransactionCount(deployer);

    const routerChainProvider = new providers.JsonRpcProvider(routerNetworks[ReceiverChains[chainId]].url);
    let nonceRouter = await routerChainProvider.getTransactionCount(deployer);

    const routerAddress = getContractAddress(deployer, nonceRouter);
    console.log("calculated future router for nonce %d: %s", nonce, routerAddress);

    const txn = await deploy("VeaOutboxGnosisToArbDevnet", {
      from: deployer,
      args: [
        deposit,
        epochPeriod,
        challengePeriod,
        numEpochTimeout,
        routerAddress,
        sequencerDelayLimit,
        sequencerFutureLimit,
      ],
      log: true,
      ...gasOptions,
    });

    console.log("VeaOutboxGnosisToArbDevnet deployed to:", txn.address);
  };

  // ----------------------------------------------------------------------------------------------
  if (chainId === 31337) {
    await hardhatDeployer();
  } else {
    await liveDeployer();
  }
};

deployOutbox.tags = ["ChiadoToArbGoerliOutbox"];
deployOutbox.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !ReceiverChains[chainId];
};

export default deployOutbox;

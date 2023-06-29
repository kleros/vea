import { parseEther } from "ethers/lib/utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import getContractAddress from "../../deploy-helpers/getContractAddress";
import { ethers } from "hardhat";

enum ReceiverChains {
  GNOSIS_CHIADO = 10200,
  HARDHAT = 31337,
}

const paramsByChainId = {
  GNOSIS_CHIADO: {
    deposit: parseEther("0.1"),
    epochPeriod: 1800, // 30 min
    minChallengePeriod: 0, // 30 min
    numEpochTimeout: 10000000000000, // never
    amb: "0x99Ca51a3534785ED619f46A79C7Ad65Fa8d85e7a",
    sequencerLimit: 86400,
    maxMissingBlocks: 10000000000000,
    routerChainId: 5,
    WETH: "0x8d74e5e4DA11629537C4575cB0f33b4F0Dfa42EB",
  },
  HARDHAT: {
    deposit: parseEther("1"),
    epochPeriod: 1800, // 30 min
    minChallengePeriod: 600, // 15 min
    numEpochTimeout: 24, // 6 hours
    amb: ethers.constants.AddressZero,
    sequencerLimit: 0,
    maxMissingBlocks: 10000000000000,
    routerChainId: 31337,
    WETH: ethers.constants.AddressZero,
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
    GNOSIS_CHIADO: config.networks.arbitrumGoerli,
    HARDHAT: config.networks.localhost,
  };

  const routerNetworks = {
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
    WETH,
  } = paramsByChainId[ReceiverChains[chainId]];

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
        minChallengePeriod,
        numEpochTimeout,
        amb,
        ethers.constants.AddressZero,
        sequencerLimit,
        maxMissingBlocks,
        routerChainId,
        WETH,
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

    const routerChainProvider = new providers.JsonRpcProvider(routerNetworks[ReceiverChains[chainId]].url);
    let nonceRouter = await routerChainProvider.getTransactionCount(deployer);

    const routerAddress = getContractAddress(deployer, nonceRouter);
    console.log("calculated future router for nonce %d: %s", nonce, routerAddress);

    const txn = await deploy("VeaOutboxArbToGnosisDevnet", {
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
        WETH,
      ],
      log: true,
      ...gasOptions,
    });

    console.log("VeaOutboxArbToGnosisDevnet deployed to:", txn.address);
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

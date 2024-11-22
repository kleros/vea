import { parseEther } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import getContractAddress from "../../deploy-helpers/getContractAddress";
import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";

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
    amb: "0x8448E15d0e706C0298dECA99F0b4744030e59d7d", // https://docs.gnosischain.com/bridges/About%20Token%20Bridges/amb-bridge#key-contracts
    sequencerLimit: 86400,
    maxMissingBlocks: 10000000000000,
    routerChainId: 11155111,
    WETH: "0x8d74e5e4DA11629537C4575cB0f33b4F0Dfa42EB",
  },
  HARDHAT: {
    deposit: parseEther("1"),
    epochPeriod: 600, // 10 min
    minChallengePeriod: 600, // 10 min
    numEpochTimeout: 24, // 6 hours
    amb: ethers.ZeroAddress,
    sequencerLimit: 0,
    maxMissingBlocks: 10000000000000,
    routerChainId: 31337,
    WETH: ethers.ZeroAddress,
  },
};

const deployOutbox: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { ethers, deployments, getNamedAccounts, getChainId, config } = hre;
  const { deploy } = deployments;

  // fallback to hardhat node signers on local network
  const deployer = (await getNamedAccounts()).deployer ?? (await hre.ethers.getSigners())[0].address;
  const chainId = Number(await getChainId());
  console.log("deploying to chainId %s with deployer %s", chainId, deployer);

  const senderNetworks = {
    GNOSIS_CHIADO: config.networks.arbitrumSepolia,
    HARDHAT: config.networks.localhost,
  };

  const routerNetworks = {
    GNOSIS_CHIADO: config.networks.sepolia,
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
        ethers.ZeroAddress,
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
      maxFeePerGas: BigNumber.from(1000000000), // 1 gwei
      maxPriorityFeePerGas: BigNumber.from(1000000000), // 1 gwei
    };

    const senderChainProvider = new ethers.JsonRpcProvider(senderNetworks[ReceiverChains[chainId]].url);
    let nonce = await senderChainProvider.getTransactionCount(deployer);

    const routerChainProvider = new ethers.JsonRpcProvider(routerNetworks[ReceiverChains[chainId]].url);
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

deployOutbox.tags = ["ArbSepoliaToChiadoOutbox"];
deployOutbox.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !ReceiverChains[chainId];
};

export default deployOutbox;

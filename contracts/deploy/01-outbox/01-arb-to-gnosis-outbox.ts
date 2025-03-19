import { parseEther } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import getContractAddress from "../utils/getContractAddress";
import { ethers } from "hardhat";

enum ReceiverChains {
  GNOSIS_MAINNET = 100,
  GNOSIS_CHIADO = 10200,
  HARDHAT = 31337,
}

const paramsByChainId = {
  GNOSIS_MAINNET: {
    deposit: parseEther("4"), // ~400 WETH budget to start, enough for 8 days of challenges
    // bridging speed is 29 - 31 hours.
    epochPeriod: 7200, // 2 hours
    minChallengePeriod: 10800, // 3 hours
    numEpochTimeout: 168, // 14 days
    maxMissingBlocks: 345, // 345 in 2160 slots, assumes 20% non-censoring validators
    routerChainId: 1,
    amb: "0x75Df5AF045d91108662D8080fD1FEFAd6aA0bb59",
    WETH: "0x6a023ccd1ff6f2045c3309768ead9e68f978f6e1",
    sequencerLimit: 86400, // 24 hours
  },
  GNOSIS_CHIADO: {
    deposit: parseEther("0.2"), // ~20 WETH budget to start, enough for 8 days of challenges
    // bridging speed is 29 - 31 hours.
    epochPeriod: 3600, // 1 hours
    minChallengePeriod: 10800, // 3 hours
    numEpochTimeout: 1000000, // never
    maxMissingBlocks: 1000000, // any
    routerChainId: 11155111,
    amb: "0x8448E15d0e706C0298dECA99F0b4744030e59d7d", // https://docs.gnosischain.com/bridges/About%20Token%20Bridges/amb-bridge#key-contracts
    WETH: "0x8d74e5e4DA11629537C4575cB0f33b4F0Dfa42EB",
    sequencerLimit: 86400, // 24 hours
  },
  HARDHAT: {
    deposit: parseEther("10"),
    // Average happy path wait time is 22.5 mins, assume no censorship
    epochPeriod: 600, // 10 min
    minChallengePeriod: 600, // 10 min (assume no sequencer backdating)
    numEpochTimeout: 21600, // 6 hours
    claimDelay: 2,
    amb: ethers.ZeroAddress,
    routerAddress: ethers.ZeroAddress,
    maxMissingBlocks: 10000000000000,
    routerChainId: 31337,
    sequencerLimit: 864,
  },
};

const deployOutbox: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { ethers, deployments, getNamedAccounts, getChainId, config } = hre;
  const { deploy } = deployments;

  // fallback to hardhat node signers on local network
  const [namedAccounts, signers, rawChainId] = await Promise.all([
    getNamedAccounts(),
    hre.ethers.getSigners(),
    getChainId(),
  ]);

  const deployer = namedAccounts.deployer ?? signers[0].address;
  const chainId = Number(rawChainId);

  console.log("deploying to chainId %s with deployer %s", chainId, deployer);

  const routerNetworks = {
    GNOSIS_MAINNET: config.networks.mainnet,
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

    const routerAddress = getContractAddress(deployer, nonce + 10);
    console.log("calculated future router for nonce %d: %s", nonce + 10, routerAddress);

    const senderGatewayAddress = getContractAddress(deployer, nonce + 6); // with the current order of transaction ,nonce for sender gateway would be 14.
    console.log("calculated future SenderGatewayToGnosis address for nonce %d: %s", nonce + 6, senderGatewayAddress);

    const ambMock = await deploy("MockAMB", {
      from: deployer,
      args: [],
      log: true,
    });

    const wethMock = await deploy("MockWETH", {
      from: deployer,
      args: [],
      log: true,
    });

    const veaOutbox = await deploy("VeaOutboxArbToGnosis", {
      from: deployer,
      contract: "VeaOutboxArbToGnosis",
      args: [
        deposit,
        epochPeriod,
        minChallengePeriod,
        numEpochTimeout,
        ambMock.address,
        routerAddress,
        sequencerLimit,
        maxMissingBlocks,
        routerChainId,
        wethMock.address,
      ],
      log: true,
    });

    await deploy("ArbToGnosisReceiverGateway", {
      from: deployer,
      contract: "ReceiverGatewayMock",
      args: [veaOutbox.address, senderGatewayAddress],
      gasLimit: 4000000,
      log: true,
    });
  };

  // ----------------------------------------------------------------------------------------------
  const liveDeployer = async () => {
    const routerChainProvider = new ethers.JsonRpcProvider(routerNetworks[ReceiverChains[chainId]].url);
    let nonceRouter = await routerChainProvider.getTransactionCount(deployer);

    const routerAddress = getContractAddress(deployer, nonceRouter);
    console.log("calculated future router for nonce %d: %s", nonceRouter, routerAddress);

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
        WETH,
      ],
      log: true,
      gasPrice: String(10 ** 9), // chiado rpc response underprices gas, 1 gwei
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

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

enum SenderChains {
  ARBITRUM_GOERLI = 421613,
  HARDHAT = 31337,
}

const paramsByChainId = {
  ARBITRUM_GOERLI: {
    epochPeriod: 3600, // 1 hour
  },
  HARDHAT: {
    epochPeriod: 1800, // 30 minutes
  },
};

// TODO: use deterministic deployments
const deployInbox: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy, execute } = deployments;
  const chainId = Number(await getChainId());

  // fallback to hardhat node signers on local network
  const deployer = (await getNamedAccounts()).deployer ?? (await hre.ethers.getSigners())[0].address;
  console.log("deployer: %s", deployer);

  const { epochPeriod } = paramsByChainId[SenderChains[chainId]];

  // ----------------------------------------------------------------------------------------------
  const hardhatDeployer = async () => {
    const veaOutbox = await deployments.get("VeaOutbox");

    const arbSysMock = await deploy("ArbSysMock", { from: deployer, log: true });

    const veaInbox = await deploy("VeaInbox", {
      from: deployer,
      contract: "VeaInboxMockArbToEth",
      args: [arbSysMock.address, epochPeriod, veaOutbox.address],
    });

    const receiverGateway = await deployments.get("ReceiverGateway");
    const receiverChainId = 31337;

    const senderGateway = await deploy("SenderGateway", {
      from: deployer,
      contract: "SenderGatewayMock",
      args: [veaInbox.address, receiverGateway.address],
      gasLimit: 4000000,
      log: true,
    });

    const outbox = await deploy("OutboxMock", {
      from: deployer,
      args: [veaInbox.address],
      log: true,
    });

    const bridge = await deploy("BridgeMock", {
      from: deployer,
      args: [outbox.address],
      log: true,
    });

    await deploy("InboxMock", {
      from: deployer,
      args: [bridge.address],
      log: true,
    });
  };

  // ----------------------------------------------------------------------------------------------
  const liveDeployer = async () => {
    const veaOutbox = await hre.companionNetworks.receiver.deployments.get("VeaOutboxArbToEthDevnet");

    await deploy("VeaInboxArbToEthDevnet", {
      from: deployer,
      contract: "VeaInboxArbToEth",
      args: [epochPeriod, veaOutbox.address],
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

deployInbox.tags = ["ArbGoerliToGoerliInbox"];
deployInbox.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !(chainId === 421613 || chainId === 31337);
};
deployInbox.runAtTheEnd = true;

export default deployInbox;

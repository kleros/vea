import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

enum SenderChains {
  GNOSIS = 100,
  GNOSIS_CHIADO = 10200,
  HARDHAT = 31337,
}

const paramsByChainId = {
  GNOSIS: {
    epochPeriod: 7200, // 2 hours
    amb: "0x75Df5AF045d91108662D8080fD1FEFAd6aA0bb59",
  },
  GNOSIS_CHIADO: {
    epochPeriod: 7200, // 2 hours
    amb: "0x8448E15d0e706C0298dECA99F0b4744030e59d7d",
  },
  HARDHAT: {
    epochPeriod: 600, // 10 minutes
  },
};

// TODO: use deterministic deployments
const deployInbox: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy } = deployments;
  const chainId = Number(await getChainId());

  const deployer = (await getNamedAccounts()).deployer;
  console.log("deployer: %s", deployer);

  const { epochPeriod, amb } = paramsByChainId[SenderChains[chainId]];

  // ----------------------------------------------------------------------------------------------

  const veaOutboxArb = await hre.companionNetworks.arbitrumSepolia.deployments.get(
    "VeaOutboxGnosisToArb" + (chainId === 100 ? "" : "Testnet")
  );

  const gasOptions = {
    maxFeePerGas: ethers.utils.parseUnits("1", "gwei"),
    maxPriorityFeePerGas: ethers.utils.parseUnits("1", "gwei"),
  };

  const inbox = await deploy("VeaInboxGnosisToArb" + (chainId === 100 ? "" : "Testnet"), {
    from: deployer,
    contract: "VeaInboxGnosisToArb",
    args: [epochPeriod, veaOutboxArb.address, amb],
    log: true,
    ...(chainId === 100 ? {} : gasOptions),
  });

  console.log("VeaInboxGnosisToArb" + (chainId === 100 ? "" : "Testnet") + " deployed to: %s", inbox.address);
};

deployInbox.tags = ["GnosisToArbInbox"];
deployInbox.skip = async ({ getChainId }) => {
  const chainId = Number(await getChainId());
  console.log(chainId);
  return !SenderChains[chainId];
};
deployInbox.runAtTheEnd = true;

export default deployInbox;

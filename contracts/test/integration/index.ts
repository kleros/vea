import { expect } from "chai";
import { deployments, ethers, getNamedAccounts, network } from "hardhat";
import { BigNumber, utils } from "ethers";
import {
  FastBridgeReceiverOnEthereum,
  ReceiverGatewayMock,
  FastBridgeSenderMock, // complete mock
  FastBridgeSender, // what should be mocked
  SenderGatewayMock,
  InboxMock,
  FastBridgeReceiverOnEthereum__factory,
  FastBridgeSender__factory,
} from "../../typechain-types";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

/* eslint-disable no-unused-vars */
/* eslint-disable no-unused-expressions */ // https://github.com/standard/standard/issues/690#issuecomment-278533482

const ONE_TENTH_ETH = BigNumber.from(10).pow(17);
const ONE_ETH = BigNumber.from(10).pow(18);

describe("Integration tests", async () => {
  let [deployer, bridger, challenger, relayer]: SignerWithAddress[] = [];
  let receiverGateway, fastBridgeSender, senderGateway, fastBridgeReceiver, inbox;

  before("Initialize wallets", async () => {
    [deployer, bridger, challenger, relayer] = await ethers.getSigners();
  });

  beforeEach("Setup", async () => {
    console.log("deployer:%s", deployer.address);
    console.log("named accounts: %O", await getNamedAccounts());

    await deployments.fixture(["ReceiverGateway", "SenderGateway"], {
      fallbackToGlobal: true,
      keepExistingDeployments: false,
    });

    fastBridgeReceiver = (await ethers.getContract("FastBridgeReceiverOnEthereum")) as FastBridgeReceiverOnEthereum;
    receiverGateway = (await ethers.getContract("ReceiverGatewayOnEthereum")) as ReceiverGatewayOnEthereum;
    fastBridgeSender = (await ethers.getContract("FastBridgeSenderMock")) as FastBridgeSenderMock;
    senderGateway = (await ethers.getContract("SenderGatewayToEthereum")) as SenderGatewayToEthereum;
    inbox = (await ethers.getContract("InboxMock")) as InboxMock;
  });

  it("Honest Claim - No Challenge - Bridger paid", async () => {
    const [bridger, challenger, relayer] = await ethers.getSigners();

    // sending sample data through the fast bridge
    const data = 1121;
    const sendFastMessagetx = await senderGateway.sendFastMessage(data);

    const MessageReceived = fastBridgeSender.filters.MessageReceived();
    const event = await fastBridgeSender.queryFilter(MessageReceived);
    const fastMessage = event[0].args.fastMessage;

    const sendBatchTx = await fastBridgeSender.connect(bridger).sendBatch();

    const BatchOutgoing = fastBridgeSender.filters.BatchOutgoing();
    const eventa = await fastBridgeSender.queryFilter(BatchOutgoing);
    const batchID = eventa[0].args.batchID;
    const batchMerkleRoot = eventa[0].args.batchMerkleRoot;

    await expect(
      fastBridgeReceiver.connect(bridger).claim(batchID, ethers.constants.HashZero, { value: ONE_TENTH_ETH })
    ).to.be.revertedWith("Invalid claim.");

    // Honest Bridger
    const bridgerClaimTx = await fastBridgeReceiver
      .connect(bridger)
      .claim(batchID, batchMerkleRoot, { value: ONE_TENTH_ETH });

    // wait for challenge period (and epoch) to pass
    await network.provider.send("evm_increaseTime", [86400]);
    await network.provider.send("evm_mine");

    const bridgerVerifyBatchTx = await fastBridgeReceiver.connect(bridger).verifyBatch(batchID);

    const verifyAndRelayTx = await fastBridgeReceiver.connect(relayer).verifyAndRelayMessage(batchID, [], fastMessage);

    const withdrawClaimDepositTx = await fastBridgeReceiver.withdrawClaimDeposit(batchID);
    await expect(fastBridgeReceiver.withdrawChallengeDeposit(batchID)).to.be.revertedWith("Challenge does not exist");
  });

  it("Honest Claim - Dishonest Challenge - Bridger paid, Challenger deposit forfeited", async () => {
    const [bridger, challenger, relayer] = await ethers.getSigners();

    const data = 1121;

    const sendFastMessagetx = await senderGateway.sendFastMessage(data);

    const MessageReceived = fastBridgeSender.filters.MessageReceived();
    const event = await fastBridgeSender.queryFilter(MessageReceived);
    const fastMessage = event[0].args.fastMessage;

    const sendBatchTx = await fastBridgeSender.connect(bridger).sendBatch();

    const BatchOutgoing = fastBridgeSender.filters.BatchOutgoing();
    const event4a = await fastBridgeSender.queryFilter(BatchOutgoing);
    const batchID = event4a[0].args.batchID;
    const batchMerkleRoot = event4a[0].args.batchMerkleRoot;

    // bridger tx starts - Honest Bridger
    const bridgerClaimTx = await fastBridgeReceiver
      .connect(bridger)
      .claim(batchID, batchMerkleRoot, { value: ONE_TENTH_ETH });

    // Challenger tx starts
    const challengeTx = await fastBridgeReceiver.connect(challenger).challenge(batchID, { value: ONE_TENTH_ETH });

    // wait for challenge period (and epoch) to pass
    await network.provider.send("evm_increaseTime", [86400]);
    await network.provider.send("evm_mine");

    await expect(fastBridgeReceiver.connect(relayer).verifyBatch(batchID))
      .to.emit(fastBridgeReceiver, "BatchVerified")
      .withArgs(batchID, false);

    const sendSafeFallbackTx = await fastBridgeSender.connect(bridger).sendSafeFallback(batchID, { gasLimit: 1000000 });

    const verifySafeBatchTx = await fastBridgeReceiver.connect(bridger).verifySafeBatch(batchID, batchMerkleRoot);

    const verifyAndRelayTx = await fastBridgeReceiver.connect(relayer).verifyAndRelayMessage(batchID, [], fastMessage);

    const withdrawClaimDepositTx = await fastBridgeReceiver.connect(relayer).withdrawClaimDeposit(batchID);

    expect(fastBridgeReceiver.connect(relayer).withdrawChallengeDeposit(batchID)).to.be.revertedWith(
      "Challenge failed."
    );
  });

  it("Dishonest Claim - Honest Challenge - Bridger deposit forfeited, Challenger paid", async () => {
    const [bridger, challenger, relayer] = await ethers.getSigners();

    const data = 1121;

    const sendFastMessagetx = await senderGateway.sendFastMessage(data);

    const MessageReceived = fastBridgeSender.filters.MessageReceived();
    const event4 = await fastBridgeSender.queryFilter(MessageReceived);
    const fastMessage = event4[0].args.fastMessage;

    const sendBatchTx = await fastBridgeSender.connect(bridger).sendBatch();

    const BatchOutgoing = fastBridgeSender.filters.BatchOutgoing();
    const event4a = await fastBridgeSender.queryFilter(BatchOutgoing);
    const batchID = event4a[0].args.batchID;
    const batchMerkleRoot = event4a[0].args.batchMerkleRoot;

    // bridger tx starts - bridger creates fakeData & fakeHash for dishonest ruling

    const fakeData = "KlerosToTheMoon";
    const fakeHash = utils.keccak256(utils.defaultAbiCoder.encode(["string"], [fakeData]));
    const bridgerClaimTx = await fastBridgeReceiver.connect(bridger).claim(batchID, fakeHash, { value: ONE_TENTH_ETH });

    // Challenger tx starts
    const challengeTx = await fastBridgeReceiver.connect(challenger).challenge(batchID, { value: ONE_TENTH_ETH });

    // wait for challenge period (and epoch) to pass
    await network.provider.send("evm_increaseTime", [86400]);
    await network.provider.send("evm_mine");

    await expect(fastBridgeReceiver.connect(relayer).verifyBatch(batchID))
      .to.emit(fastBridgeReceiver, "BatchVerified")
      .withArgs(batchID, false);

    const sendSafeFallbackTx = await fastBridgeSender.connect(bridger).sendSafeFallback(batchID, { gasLimit: 1000000 });

    const verifySafeBatchTx = await fastBridgeReceiver.connect(bridger).verifySafeBatch(batchID, batchMerkleRoot);

    const verifyAndRelayTx = await fastBridgeReceiver.connect(relayer).verifyAndRelayMessage(batchID, [], fastMessage);

    expect(fastBridgeReceiver.connect(relayer).withdrawClaimDeposit(batchID)).to.be.revertedWith("Claim failed.");

    await expect(fastBridgeReceiver.connect(relayer).withdrawChallengeDeposit(batchID))
      .to.emit(fastBridgeReceiver, "ChallengeDepositWithdrawn")
      .withArgs(batchID, challenger.address);
  });

  async function mineBlocks(n) {
    for (let index = 0; index < n; index++) {
      await network.provider.send("evm_mine");
    }
  }
});

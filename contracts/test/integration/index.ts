import { expect } from "chai";
import { deployments, ethers, getNamedAccounts, network } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { BigNumber, utils } from "ethers";
import "@nomiclabs/hardhat-ethers";

import {
  FastBridgeReceiverOnEthereumMock,
  ReceiverGatewayMock,
  FastBridgeSenderOnArbitrumMock,
  SenderGatewayMock,
  InboxMock,
  ArbSysMock,
} from "../../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import "@nomicfoundation/hardhat-chai-matchers";

/* eslint-disable no-unused-vars */
/* eslint-disable no-unused-expressions */ // https://github.com/standard/standard/issues/690#issuecomment-278533482

const ONE_HUNDREDTH_ETH = BigNumber.from(10).pow(16);
const ONE_TENTH_ETH = BigNumber.from(10).pow(17);
const ONE_ETH = BigNumber.from(10).pow(18);
const HARDHAT_CHAIN_ID = 31337;
const EPOCH_PERIOD = 86400;
const CHALLENGE_PERIOD = 14400;

describe("Integration tests", async () => {
  let [deployer, bridger, challenger, relayer]: SignerWithAddress[] = [];
  let receiverGateway: ReceiverGatewayMock;
  let fastBridgeSender: FastBridgeReceiverOnEthereumMock;
  let senderGateway: SenderGatewayMock;
  let fastBridgeReceiver: FastBridgeSenderOnArbitrumMock;
  let inbox: InboxMock;
  let arbsysMock: ArbSysMock;

  before("Initialize wallets", async () => {
    [deployer, bridger, challenger, relayer] = await ethers.getSigners();
    console.log("deployer:%s", deployer.address);
    console.log("named accounts: %O", await getNamedAccounts());
  });

  beforeEach("Setup", async () => {
    await deployments.fixture(["ArbToEthReceiver", "ArbToEthSender"], {
      fallbackToGlobal: true,
      keepExistingDeployments: false,
    });

    fastBridgeReceiver = (await ethers.getContract("FastBridgeReceiverOnEthereum")) as FastBridgeReceiverOnEthereumMock;
    receiverGateway = (await ethers.getContract("ReceiverGateway")) as ReceiverGatewayMock;
    fastBridgeSender = (await ethers.getContract("FastBridgeSender")) as FastBridgeSenderOnArbitrumMock;
    senderGateway = (await ethers.getContract("SenderGateway")) as SenderGatewayMock;
    inbox = (await ethers.getContract("InboxMock")) as InboxMock;
    arbsysMock = (await ethers.getContract("ArbSysMock")) as ArbSysMock;
  });

  it("should initialize contracts correctly", async () => {
    // Sender Gateway
    expect(await senderGateway.fastBridgeSender()).to.equal(fastBridgeSender.address);
    expect(await senderGateway.receiverGateway()).to.equal(receiverGateway.address);
    expect(await senderGateway.receiverChainID()).to.equal(HARDHAT_CHAIN_ID);

    // FastBridgeSender
    expect(await fastBridgeSender.arbSys()).to.equal(arbsysMock.address);
    expect(await fastBridgeSender.epochPeriod()).to.equal(EPOCH_PERIOD);
    expect(await fastBridgeSender.safeBridgeReceiver()).to.equal(fastBridgeReceiver.address);

    // FastBridgeReceiver
    expect(await fastBridgeReceiver.deposit()).to.equal(ONE_TENTH_ETH);
    expect(await fastBridgeReceiver.epochPeriod()).to.equal(EPOCH_PERIOD);
    expect(await fastBridgeReceiver.challengePeriod()).to.equal(CHALLENGE_PERIOD);
    expect(await fastBridgeReceiver.safeBridgeSender()).to.equal(fastBridgeSender.address);
    expect(await fastBridgeReceiver.inbox()).to.equal(inbox.address);

    // ReceiverGateway
    expect(await receiverGateway.fastBridgeReceiver()).to.equal(fastBridgeReceiver.address);
    expect(await receiverGateway.senderGateway()).to.equal(senderGateway.address);
    expect(await receiverGateway.senderChainID()).to.equal(HARDHAT_CHAIN_ID);
  });

  describe("Honest Claim - No Challenge - Bridger Paid", async () => {
    it("should send the fastMessage", async () => {
      // sending sample data through the fast Bridge
      const data = 1121;
      const sendFastMessageTx = await senderGateway.sendFastMessage(data);

      await expect(sendFastMessageTx).to.emit(fastBridgeSender, "MessageReceived");
    });

    it("should send the batch", async () => {
      // should revert if No messages have been sent yet.
      await expect(fastBridgeSender.connect(bridger).sendBatch()).to.be.revertedWith("No messages to send.");

      const data = 1121;
      let sendFastMessageTx = await senderGateway.sendFastMessage(data);

      const MessageReceived = fastBridgeSender.filters.MessageReceived();
      const MessageReceivedEvent = await fastBridgeSender.queryFilter(MessageReceived);
      const fastMessage = MessageReceivedEvent[0].args.fastMessage;

      const currentBlockNum = ethers.provider.getBlockNumber();
      const currentTimestamp = (await ethers.provider.getBlock(currentBlockNum)).timestamp;
      const currentEpoch = Math.floor(currentTimestamp / EPOCH_PERIOD);
      const calculatedepoch = currentEpoch - 1;

      expect(await fastBridgeSender.fastOutbox(Math.floor(currentTimestamp / EPOCH_PERIOD))).to.equal(
        ethers.utils.formatBytes32String("")
      );

      await expect(fastBridgeSender.connect(bridger).sendBatch())
        .to.emit(fastBridgeSender, "BatchOutgoing")
        .withArgs(
          calculatedepoch,
          1,
          currentEpoch,
          "0x1752c7d674ce4b36067e76a6ff780f5b09be0c4c9e90195ea03c98fef985afb6"
        );

      expect(await fastBridgeSender.currentBatchID()).to.equal(Math.floor(currentTimestamp / EPOCH_PERIOD));
      expect(await fastBridgeSender.batchSize()).to.equal(0);

      const BatchOutgoing = fastBridgeSender.filters.BatchOutgoing();
      const batchOutGoingEvent = await fastBridgeSender.queryFilter(BatchOutgoing);
      const epoch = batchOutGoingEvent[0].args.epoch;
      const batchMerkleRoot = batchOutGoingEvent[0].args.batchMerkleRoot;

      expect(await fastBridgeSender.fastOutbox(Math.floor(currentTimestamp / EPOCH_PERIOD))).to.equal(batchMerkleRoot);
    });

    it("should be able to claim", async () => {
      const data = 1121;
      const sendFastMessagetx = await senderGateway.sendFastMessage(data);

      const MessageReceived = fastBridgeSender.filters.MessageReceived();
      const MessageReceivedEvent = await fastBridgeSender.queryFilter(MessageReceived);
      const fastMessage = MessageReceivedEvent[0].args.fastMessage;

      const sendBatchTx = await fastBridgeSender.connect(bridger).sendBatch();

      const BatchOutgoing = fastBridgeSender.filters.BatchOutgoing();
      const batchOutGoingEvent = await fastBridgeSender.queryFilter(BatchOutgoing);
      const epoch = batchOutGoingEvent[0].args.epoch;
      const batchMerkleRoot = batchOutGoingEvent[0].args.batchMerkleRoot;

      const invalidEpoch = BigNumber.from(2).add(epoch);

      await expect(
        fastBridgeReceiver.connect(bridger).claim(epoch, batchMerkleRoot, { value: ONE_HUNDREDTH_ETH })
      ).to.be.revertedWith("Insufficient claim deposit.");

      await expect(
        fastBridgeReceiver.connect(bridger).claim(epoch, ethers.constants.HashZero, { value: ONE_TENTH_ETH })
      ).to.be.revertedWith("Invalid claim.");

      await expect(
        fastBridgeReceiver.connect(bridger).claim(invalidEpoch, batchMerkleRoot, { value: ONE_TENTH_ETH })
      ).to.be.revertedWith("Invalid epoch.");

      const bridgerClaimTx = await fastBridgeReceiver
        .connect(bridger)
        .claim(epoch, batchMerkleRoot, { value: ONE_TENTH_ETH });

      await expect(bridgerClaimTx).to.emit(fastBridgeReceiver, "ClaimReceived").withArgs(epoch, batchMerkleRoot);

      expect(await (await fastBridgeReceiver.claims(epoch)).bridger).to.equal(bridger.address);
      expect(await (await fastBridgeReceiver.claims(epoch)).honest).to.equal(false);
      expect(await (await fastBridgeReceiver.claims(epoch)).verificationAttempted).to.equal(false);
      expect(await (await fastBridgeReceiver.claims(epoch)).depositAndRewardWithdrawn).to.equal(false);

      await expect(
        fastBridgeReceiver.connect(bridger).claim(epoch, batchMerkleRoot, { value: ONE_TENTH_ETH })
      ).to.be.revertedWith("Claim already made for most recent finalized epoch."); // should fail with this revert message.
    });

    it("should be able to verify batch", async () => {
      // should fail for invalid epochs
      await expect(fastBridgeReceiver.connect(bridger).verifyBatch(0)).to.be.revertedWith(
        "Invalid epoch, no claim to verify."
      );

      // sending sample data through the fast bridge
      const data = 1121;
      const sendFastMessagetx = await senderGateway.sendFastMessage(data);

      const MessageReceived = fastBridgeSender.filters.MessageReceived();
      const MessageReceivedEvent = await fastBridgeSender.queryFilter(MessageReceived);
      const fastMessage = MessageReceivedEvent[0].args.fastMessage;

      const sendBatchTx = await fastBridgeSender.connect(bridger).sendBatch();

      const BatchOutgoing = fastBridgeSender.filters.BatchOutgoing();
      const batchOutGoingEvent = await fastBridgeSender.queryFilter(BatchOutgoing);
      const epoch = batchOutGoingEvent[0].args.epoch;
      const batchMerkleRoot = batchOutGoingEvent[0].args.batchMerkleRoot;

      // Honest Bridger
      const bridgerClaimTx = await fastBridgeReceiver
        .connect(bridger)
        .claim(epoch, batchMerkleRoot, { value: ONE_TENTH_ETH });

      // should revert as the challenge period has not passed
      await expect(fastBridgeReceiver.connect(bridger).verifyBatch(epoch)).to.be.revertedWith(
        "Challenge period has not yet elapsed."
      );

      // wait for challenge period (and epoch) to pass
      await network.provider.send("evm_increaseTime", [86400]);
      await network.provider.send("evm_mine");

      const bridgerVerifyBatchTx = await fastBridgeReceiver.connect(bridger).verifyBatch(epoch);
      await expect(bridgerVerifyBatchTx).to.emit(fastBridgeReceiver, "BatchVerified").withArgs(epoch, true);

      expect(await fastBridgeReceiver.fastInbox(epoch)).to.equal(batchMerkleRoot);
      expect(await (await fastBridgeReceiver.claims(epoch)).honest).to.equal(true);

      await expect(fastBridgeReceiver.connect(bridger).verifyBatch(epoch)).to.be.revertedWith(
        "Optimistic verification already attempted."
      );
    });

    it("should be able verify and relay message", async () => {
      // sending sample data through the fast bridge
      const data = 1121;
      const sendFastMessagetx = await senderGateway.sendFastMessage(data);

      const MessageReceived = fastBridgeSender.filters.MessageReceived();
      const MessageReceivedEvent = await fastBridgeSender.queryFilter(MessageReceived);
      const fastMessage = MessageReceivedEvent[0].args.fastMessage;

      const sendBatchTx = await fastBridgeSender.connect(bridger).sendBatch();

      const BatchOutgoing = fastBridgeSender.filters.BatchOutgoing();
      const batchOutGoingEvent = await fastBridgeSender.queryFilter(BatchOutgoing);
      const epoch = batchOutGoingEvent[0].args.epoch;
      const batchMerkleRoot = batchOutGoingEvent[0].args.batchMerkleRoot;

      await expect(
        fastBridgeReceiver.connect(bridger).claim(epoch, ethers.constants.HashZero, { value: ONE_TENTH_ETH })
      ).to.be.revertedWith("Invalid claim.");

      // Honest Bridger
      const bridgerClaimTx = await fastBridgeReceiver
        .connect(bridger)
        .claim(epoch, batchMerkleRoot, { value: ONE_TENTH_ETH });

      // should revert as the challenge period has not yet passed, therefore the epoch is invalid.
      await expect(
        fastBridgeReceiver.connect(relayer).verifyAndRelayMessage(epoch, [], fastMessage)
      ).to.be.revertedWith("Invalid epoch.");

      // wait for challenge period (and epoch) to pass
      await network.provider.send("evm_increaseTime", [86400]);
      await network.provider.send("evm_mine");

      const bridgerVerifyBatchTx = await fastBridgeReceiver.connect(bridger).verifyBatch(epoch);

      const invalidMessage = fastMessage.slice(0, 391) + "101";

      await expect(
        fastBridgeReceiver.connect(relayer).verifyAndRelayMessage(epoch, [], invalidMessage)
      ).to.be.revertedWith("Invalid proof.");

      const verifyAndRelayTx = await fastBridgeReceiver.connect(relayer).verifyAndRelayMessage(epoch, [], fastMessage);
      await expect(verifyAndRelayTx).to.emit(fastBridgeReceiver, "MessageRelayed").withArgs(epoch, 0);

      await expect(
        fastBridgeReceiver.connect(relayer).verifyAndRelayMessage(epoch, [], fastMessage)
      ).to.be.revertedWith("Message already relayed");
    });

    it("should allow bridger to claim deposit", async () => {
      // sending sample data through the fast bridge
      const data = 1121;
      const sendFastMessagetx = await senderGateway.sendFastMessage(data);

      const MessageReceived = fastBridgeSender.filters.MessageReceived();
      const MessageReceivedEvent = await fastBridgeSender.queryFilter(MessageReceived);
      const fastMessage = MessageReceivedEvent[0].args.fastMessage;

      const sendBatchTx = await fastBridgeSender.connect(bridger).sendBatch();

      const BatchOutgoing = fastBridgeSender.filters.BatchOutgoing();
      const batchOutGoingEvent = await fastBridgeSender.queryFilter(BatchOutgoing);
      const epoch = batchOutGoingEvent[0].args.epoch;
      const batchMerkleRoot = batchOutGoingEvent[0].args.batchMerkleRoot;

      await expect(
        fastBridgeReceiver.connect(bridger).claim(epoch, ethers.constants.HashZero, { value: ONE_TENTH_ETH })
      ).to.be.revertedWith("Invalid claim.");

      // Honest Bridger
      const bridgerClaimTx = await fastBridgeReceiver
        .connect(bridger)
        .claim(epoch, batchMerkleRoot, { value: ONE_TENTH_ETH });

      // wait for challenge period (and epoch) to pass
      await network.provider.send("evm_increaseTime", [86400]);
      await network.provider.send("evm_mine");

      const bridgerVerifyBatchTx = await fastBridgeReceiver.connect(bridger).verifyBatch(epoch);
      const verifyAndRelayTx = await fastBridgeReceiver.connect(relayer).verifyAndRelayMessage(epoch, [], fastMessage);

      // should revert for invalid epoch
      await expect(fastBridgeReceiver.connect(bridger).withdrawClaimDeposit(0)).to.be.revertedWith(
        "Claim does not exist"
      );

      const withdrawClaimDepositTx = await fastBridgeReceiver.connect(bridger).withdrawClaimDeposit(epoch);
      await expect(withdrawClaimDepositTx)
        .to.emit(fastBridgeReceiver, "ClaimDepositWithdrawn")
        .withArgs(epoch, bridger.address);
    });

    it("should not allow challenger to withdraw deposit - as challenge doesn't exist", async () => {
      // sending sample data through the fast bridge
      const data = 1121;
      const sendFastMessagetx = await senderGateway.sendFastMessage(data);

      const MessageReceived = fastBridgeSender.filters.MessageReceived();
      const MessageReceivedEvent = await fastBridgeSender.queryFilter(MessageReceived);
      const fastMessage = MessageReceivedEvent[0].args.fastMessage;

      const sendBatchTx = await fastBridgeSender.connect(bridger).sendBatch();

      const BatchOutgoing = fastBridgeSender.filters.BatchOutgoing();
      const batchOutGoingEvent = await fastBridgeSender.queryFilter(BatchOutgoing);
      const epoch = batchOutGoingEvent[0].args.epoch;
      const batchMerkleRoot = batchOutGoingEvent[0].args.batchMerkleRoot;

      await expect(
        fastBridgeReceiver.connect(bridger).claim(epoch, ethers.constants.HashZero, { value: ONE_TENTH_ETH })
      ).to.be.revertedWith("Invalid claim.");

      // Honest Bridger
      const bridgerClaimTx = await fastBridgeReceiver
        .connect(bridger)
        .claim(epoch, batchMerkleRoot, { value: ONE_TENTH_ETH });

      // wait for challenge period (and epoch) to pass
      await network.provider.send("evm_increaseTime", [86400]);
      await network.provider.send("evm_mine");

      const bridgerVerifyBatchTx = await fastBridgeReceiver.connect(bridger).verifyBatch(epoch);
      const verifyAndRelayTx = await fastBridgeReceiver.connect(relayer).verifyAndRelayMessage(epoch, [], fastMessage);

      const withdrawClaimDepositTx = await fastBridgeReceiver.withdrawClaimDeposit(epoch);
      await expect(fastBridgeReceiver.withdrawChallengeDeposit(epoch)).to.be.revertedWith("Challenge does not exist");
    });
  });

  describe("Honest Claim - Dishonest Challenge - Bridger paid, challenger deposit forfeited", async () => {
    // most of the functions are tested thoroughly in the above test case
    // only challenge related functionality are tested here

    it("should not be able to challenge after challenge period elapsed", async () => {
      // should revert when challenged for invalid claim
      await expect(fastBridgeReceiver.connect(challenger).challenge(0, { value: ONE_TENTH_ETH })).to.be.revertedWith(
        "No claim to challenge."
      );

      const data = 1121;

      const sendFastMessagetx = await senderGateway.sendFastMessage(data);
      const MessageReceived = fastBridgeSender.filters.MessageReceived();
      const MessageReceivedEvent = await fastBridgeSender.queryFilter(MessageReceived);
      const fastMessage = MessageReceivedEvent[0].args.fastMessage;

      const sendBatchTx = await fastBridgeSender.connect(bridger).sendBatch();

      const BatchOutgoing = fastBridgeSender.filters.BatchOutgoing();
      const batchOutGoingEvent = await fastBridgeSender.queryFilter(BatchOutgoing);
      const epoch = batchOutGoingEvent[0].args.epoch;
      const batchMerkleRoot = batchOutGoingEvent[0].args.batchMerkleRoot;

      // bridger tx starts - Honest Bridger
      const bridgerClaimTx = await fastBridgeReceiver
        .connect(bridger)
        .claim(epoch, batchMerkleRoot, { value: ONE_TENTH_ETH });

      // should revert if deposit is less than claim deposit
      // @note - if challenger deposits more than deposit then only the deposit will be returned
      await expect(
        fastBridgeReceiver.connect(challenger).challenge(epoch, { value: ONE_HUNDREDTH_ETH })
      ).to.be.revertedWith("Not enough claim deposit");

      // wait for challenge period (and epoch) to pass
      await network.provider.send("evm_increaseTime", [86400]);
      await network.provider.send("evm_mine");

      await expect(
        fastBridgeReceiver.connect(challenger).challenge(epoch, { value: ONE_TENTH_ETH })
      ).to.be.revertedWith("Challenge period elapsed.");
    });

    it("should be able to challenge", async () => {
      const data = 1121;

      const sendFastMessagetx = await senderGateway.sendFastMessage(data);
      const MessageReceived = fastBridgeSender.filters.MessageReceived();
      const MessageReceivedEvent = await fastBridgeSender.queryFilter(MessageReceived);
      const fastMessage = MessageReceivedEvent[0].args.fastMessage;

      const sendBatchTx = await fastBridgeSender.connect(bridger).sendBatch();

      const BatchOutgoing = fastBridgeSender.filters.BatchOutgoing();
      const batchOutGoingEvent = await fastBridgeSender.queryFilter(BatchOutgoing);
      const epoch = batchOutGoingEvent[0].args.epoch;
      const batchMerkleRoot = batchOutGoingEvent[0].args.batchMerkleRoot;

      // bridger tx starts - Honest Bridger
      const bridgerClaimTx = await fastBridgeReceiver
        .connect(bridger)
        .claim(epoch, batchMerkleRoot, { value: ONE_TENTH_ETH });

      const challengeTx = await fastBridgeReceiver.connect(challenger).challenge(epoch, { value: ONE_TENTH_ETH });
      await expect(challengeTx).to.emit(fastBridgeReceiver, "ClaimChallenged").withArgs(epoch);
    });

    it("should be able to fallback to send safe", async () => {
      const data = 1121;

      const sendFastMessagetx = await senderGateway.sendFastMessage(data);
      const MessageReceived = fastBridgeSender.filters.MessageReceived();
      const MessageReceivedEvent = await fastBridgeSender.queryFilter(MessageReceived);
      const fastMessage = MessageReceivedEvent[0].args.fastMessage;

      const sendBatchTx = await fastBridgeSender.connect(bridger).sendBatch();

      const BatchOutgoing = fastBridgeSender.filters.BatchOutgoing();
      const batchOutGoingEvent = await fastBridgeSender.queryFilter(BatchOutgoing);
      const epoch = batchOutGoingEvent[0].args.epoch;
      const batchMerkleRoot = batchOutGoingEvent[0].args.batchMerkleRoot;
      // bridger tx starts - Honest Bridger
      const bridgerClaimTx = await fastBridgeReceiver
        .connect(bridger)
        .claim(epoch, batchMerkleRoot, { value: ONE_TENTH_ETH });

      const challengeTx = await fastBridgeReceiver.connect(challenger).challenge(epoch, { value: ONE_TENTH_ETH });

      // wait for challenge period (and epoch) to pass
      await network.provider.send("evm_increaseTime", [86400]);
      await network.provider.send("evm_mine");

      await expect(fastBridgeReceiver.connect(relayer).verifyBatch(epoch))
        .to.emit(fastBridgeReceiver, "BatchVerified")
        .withArgs(epoch, false);

      const invalidEpoch = BigNumber.from(2).add(epoch);
      await expect(
        fastBridgeSender.connect(bridger).sendSafeFallback(invalidEpoch, { gasLimit: 1000000 })
      ).to.be.revertedWith("Invalid epoch.");

      const sendSafeFallbackTx = await fastBridgeSender.connect(bridger).sendSafeFallback(epoch, { gasLimit: 1000000 });
      await expect(sendSafeFallbackTx)
        .to.emit(fastBridgeSender, "SentSafe")
        .withArgs(epoch, ethers.utils.formatBytes32String("")); // ticketId is always 0x00..0
    });

    it("challenger's deposit should be forfeited", async () => {
      // sample data
      const data = 1121;

      const sendFastMessagetx = await senderGateway.sendFastMessage(data);
      const MessageReceived = fastBridgeSender.filters.MessageReceived();
      const MessageReceivedEvent = await fastBridgeSender.queryFilter(MessageReceived);
      const fastMessage = MessageReceivedEvent[0].args.fastMessage;

      const sendBatchTx = await fastBridgeSender.connect(bridger).sendBatch();

      const BatchOutgoing = fastBridgeSender.filters.BatchOutgoing();
      const batchOutGoingEvent = await fastBridgeSender.queryFilter(BatchOutgoing);
      const epoch = batchOutGoingEvent[0].args.epoch;
      const batchMerkleRoot = batchOutGoingEvent[0].args.batchMerkleRoot;

      // bridger tx starts - Honest Bridger
      const bridgerClaimTx = await fastBridgeReceiver
        .connect(bridger)
        .claim(epoch, batchMerkleRoot, { value: ONE_TENTH_ETH });

      // withdraw challenge deposit should revert for invalid epoch
      await expect(fastBridgeReceiver.connect(challenger).withdrawChallengeDeposit(epoch)).to.be.revertedWith(
        "Challenge does not exist"
      );

      // Challenger tx starts
      const challengeTx = await fastBridgeReceiver.connect(challenger).challenge(epoch, { value: ONE_TENTH_ETH });

      // wait for challenge period (and epoch) to pass
      await network.provider.send("evm_increaseTime", [86400]);
      await network.provider.send("evm_mine");

      await expect(fastBridgeReceiver.connect(relayer).verifyBatch(epoch))
        .to.emit(fastBridgeReceiver, "BatchVerified")
        .withArgs(epoch, false);

      expect(await (await fastBridgeReceiver.challenges(epoch)).honest).to.equal(false);
      const sendSafeFallbackTx = await fastBridgeSender.connect(bridger).sendSafeFallback(epoch, { gasLimit: 1000000 });
      expect(await (await fastBridgeReceiver.challenges(epoch)).honest).to.equal(false);
      const verifyAndRelayTx = await fastBridgeReceiver.connect(relayer).verifyAndRelayMessage(epoch, [], fastMessage);
      const withdrawClaimDepositTx = await fastBridgeReceiver.withdrawClaimDeposit(epoch);

      await expect(fastBridgeReceiver.withdrawChallengeDeposit(epoch)).to.be.revertedWith("Challenge failed.");
    });
  });

  describe("Dishonest Claim - Honest Challenge - Bridger deposit forfeited, Challenger paid", async () => {
    it("Bridger deposit forfeited, Challenger paid", async () => {
      const data = 1121;

      const sendFastMessagetx = await senderGateway.sendFastMessage(data);

      const MessageReceived = fastBridgeSender.filters.MessageReceived();
      const MessageReceivedEvent = await fastBridgeSender.queryFilter(MessageReceived);
      const fastMessage = MessageReceivedEvent[0].args.fastMessage;

      const sendBatchTx = await fastBridgeSender.connect(bridger).sendBatch();

      const BatchOutgoing = fastBridgeSender.filters.BatchOutgoing();
      const batchOutGoingEvent = await fastBridgeSender.queryFilter(BatchOutgoing);
      const epoch = batchOutGoingEvent[0].args.epoch;
      const batchMerkleRoot = batchOutGoingEvent[0].args.batchMerkleRoot;

      // bridger tx starts - bridger creates fakeData & fakeHash

      const fakeData = "KlerosToTheMoon";
      const fakeHash = utils.keccak256(utils.defaultAbiCoder.encode(["string"], [fakeData]));
      const bridgerClaimTx = await fastBridgeReceiver.connect(bridger).claim(epoch, fakeHash, { value: ONE_TENTH_ETH });

      // Challenger tx starts
      const challengeTx = await fastBridgeReceiver.connect(challenger).challenge(epoch, { value: ONE_TENTH_ETH });

      // wait for challenge period (and epoch) to pass
      await network.provider.send("evm_increaseTime", [86400]);
      await network.provider.send("evm_mine");

      await expect(fastBridgeReceiver.connect(relayer).verifyBatch(epoch))
        .to.emit(fastBridgeReceiver, "BatchVerified")
        .withArgs(epoch, false);

      // sendSafeFallback internally calls the verifySafeBatch
      const sendSafeFallbackTx = await fastBridgeSender.connect(bridger).sendSafeFallback(epoch, { gasLimit: 1000000 });
      const verifyAndRelayTx = await fastBridgeReceiver.connect(relayer).verifyAndRelayMessage(epoch, [], fastMessage);
      expect(fastBridgeReceiver.connect(relayer).withdrawClaimDeposit(epoch)).to.be.revertedWith("Claim failed.");

      await expect(fastBridgeReceiver.connect(relayer).withdrawChallengeDeposit(epoch))
        .to.emit(fastBridgeReceiver, "ChallengeDepositWithdrawn")
        .withArgs(epoch, challenger.address);
    });
  });
});

import chai, { expect } from "chai";
import { deployments, ethers, getNamedAccounts, network } from "hardhat";
import { BigNumber, utils } from "ethers";
import {
  FastBridgeReceiverOnEthereum,
  ReceiverGatewayMock,
  FastBridgeSenderOnArbitrum, // complete mock
  SenderGatewayMock,
  InboxMock,
  ArbSysMock,
} from "../../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
// import { solidity } from "ethereum-waffle";

// chai.use(solidity)
/* eslint-disable no-unused-vars */
/* eslint-disable no-unused-expressions */ // https://github.com/standard/standard/issues/690#issuecomment-278533482

const ONE_TENTH_ETH = BigNumber.from(10).pow(17);
const ONE_ETH = BigNumber.from(10).pow(18);
const HARDHAT_CHAIN_ID = 31337;
const EPOCH_PERIOD = 86400;
const CHALLENGE_PERIOD = 14400;

describe("Integration tests", async () => {
  let [deployer, bridger, challenger, relayer]: SignerWithAddress[] = [];
  let receiverGateway: ReceiverGatewayMock;
  let fastBridgeSender: FastBridgeSenderOnArbitrum;
  let senderGateway: SenderGatewayMock;
  let fastBridgeReceiver: FastBridgeReceiverOnEthereum;
  let inbox: InboxMock;
  let arbsysMock: ArbSysMock;

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
    receiverGateway = (await ethers.getContract("ReceiverGatewayOnEthereum")) as ReceiverGatewayMock;
    fastBridgeSender = (await ethers.getContract("FastBridgeSenderMock")) as FastBridgeSenderOnArbitrum;
    senderGateway = (await ethers.getContract("SenderGatewayToEthereum")) as SenderGatewayMock;
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
    expect(await fastBridgeReceiver.safeBridgeSender()).to.equal(fastBridgeSender.address); // @note - need to look into this
    expect(await fastBridgeReceiver.inbox()).to.equal(inbox.address);

    // ReceiverGateway
    expect(await receiverGateway.fastBridgeReceiver()).to.equal(fastBridgeReceiver.address);
    expect(await receiverGateway.senderGateway()).to.equal(senderGateway.address);
    expect(await receiverGateway.senderChainID()).to.equal(HARDHAT_CHAIN_ID);
  });

  describe("Honest Claim - No Challenge - Bridger Paiddd", async () => {
    it("should send the fastMessage", async () => {
      // sending sample data through the fast Bridge
      const data = 1121;
      let sendFastMessageTx = await senderGateway.sendFastMessage(data);
      await sendFastMessageTx.wait();
      console.log(sendFastMessageTx);
      // @note - need to check the arguments of the MessageReceived
      // const IReceiverGatewayMock = receiverGateway.interface;
      // const receiveMessageSig = await IReceiverGatewayMock.getSighash("receiveMessage(uint256)")
      // const encodedData =  await IReceiverGatewayMock.encodeFunctionData(receiveMessageSig, [data]);

      // should emit MessageReceived.
      // await expect(sendFastMessageTx).to.emit(fastBridgeSender, 'MessageReceived');
    });

    it("should send the batch", async () => {
      // should recert if No messages have been sent yet.
      // expect(await fastBridgeSender.connect(bridger).sendBatch())
      // .to.be.revertedWith("N to send.")

      const data = 1121;
      let sendFastMessageTx = await senderGateway.sendFastMessage(data);
      const MessageReceived = fastBridgeSender.filters.MessageReceived();
      const event = await fastBridgeSender.queryFilter(MessageReceived);
      console.log(event);
      const fastMessage = event[0].args.fastMessage;
      const currentBlockNum = ethers.provider.getBlockNumber();
      const currentTimestamp = (await ethers.provider.getBlock(currentBlockNum)).timestamp;

      expect(await fastBridgeSender.fastOutbox(Math.floor(currentTimestamp / EPOCH_PERIOD))).to.equal(
        ethers.utils.formatBytes32String("")
      );

      const sendBatchTx = await fastBridgeSender.connect(bridger).sendBatch();
      // await expect(sendBatchTx)
      // .to.emit(fastBridgeSender,"something")
      // .withArgs(0, 1,currentTimestamp/EPOCH_PERIOD, 1);

      expect(await fastBridgeSender.currentBatchID()).to.equal(Math.floor(currentTimestamp / EPOCH_PERIOD));
      expect(await fastBridgeSender.batchSize()).to.equal(0);

      const BatchOutgoing = fastBridgeSender.filters.BatchOutgoing();
      const eventa = await fastBridgeSender.queryFilter(BatchOutgoing);
      const batchID = eventa[0].args.batchID;
      const batchMerkleRoot = eventa[0].args.batchMerkleRoot;

      expect(await fastBridgeSender.fastOutbox(Math.floor(currentTimestamp / EPOCH_PERIOD))).to.equal(batchMerkleRoot);
    });
  });

  it("Honest Claim - No Challenge - Bridger paid", async () => {
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

import { expect } from "chai";
import { deployments, ethers, getNamedAccounts, network } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { BigNumber, utils } from "ethers";
import "@nomiclabs/hardhat-ethers";
const { mine } = require("@nomicfoundation/hardhat-network-helpers");

import {
  VeaOutboxMockArbToEth as VeaOutboxMock,
  ReceiverGatewayMock,
  VeaInboxMockArbToEth as VeaInboxMock,
  SenderGatewayMock,
  BridgeMock,
  ArbSysMock,
} from "../../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import "@nomicfoundation/hardhat-chai-matchers";
import { MerkleTree } from "../merkle/MerkleTree";
import { zeroAddress } from "ethereumjs-util";

/* eslint-disable no-unused-vars */
/* eslint-disable no-unused-expressions */ // https://github.com/standard/standard/issues/690#issuecomment-278533482

const ONE_HUNDREDTH_ETH = BigNumber.from(10).pow(16);
const ONE_TENTH_ETH = BigNumber.from(10).pow(17);
const ONE_ETH = BigNumber.from(10).pow(18);
const TEN_ETH = BigNumber.from(10).pow(19);
const HARDHAT_CHAIN_ID = 31337;
const EPOCH_PERIOD = 600; // 10 minutes for Hardhat
const CHALLENGE_PERIOD = 600; // 10 minutes for Hardhat

describe("Integration tests", async () => {
  let [deployer, bridger, challenger, relayer]: SignerWithAddress[] = [];
  let receiverGateway: ReceiverGatewayMock;
  let veaInbox: VeaInboxMock;
  let senderGateway: SenderGatewayMock;
  let veaOutbox: VeaOutboxMock;
  let bridge: BridgeMock;
  let arbsysMock: ArbSysMock;

  before("Initialize wallets", async () => {
    [deployer, bridger, challenger, relayer] = await ethers.getSigners();
    console.log("deployer:%s", deployer.address);
    console.log("named accounts: %O", await getNamedAccounts());
  });

  beforeEach("Setup", async () => {
    await deployments.fixture(["ArbToEthOutbox", "ArbToEthInbox"], {
      fallbackToGlobal: true,
      keepExistingDeployments: false,
    });

    veaOutbox = (await ethers.getContract("VeaOutbox")) as VeaOutboxMock;
    receiverGateway = (await ethers.getContract("ReceiverGateway")) as ReceiverGatewayMock;
    veaInbox = (await ethers.getContract("VeaInbox")) as VeaInboxMock;
    senderGateway = (await ethers.getContract("SenderGateway")) as SenderGatewayMock;
    bridge = (await ethers.getContract("BridgeMock")) as BridgeMock;
    arbsysMock = (await ethers.getContract("ArbSysMock")) as ArbSysMock;
  });

  it("should initialize contracts correctly", async () => {
    // Sender Gateway
    expect(await senderGateway.veaInbox()).to.equal(veaInbox.address);
    expect(await senderGateway.receiverGateway()).to.equal(receiverGateway.address);

    // veaInbox
    expect(await veaInbox.arbSys()).to.equal(arbsysMock.address);
    expect(await veaInbox.epochPeriod()).to.equal(EPOCH_PERIOD);
    expect(await veaInbox.veaOutboxArbToEth()).to.equal(veaOutbox.address);

    // veaOutbox
    expect(await veaOutbox.deposit()).to.equal(TEN_ETH);
    expect(await veaOutbox.epochPeriod()).to.equal(EPOCH_PERIOD);
    expect(await veaOutbox.minChallengePeriod()).to.equal(CHALLENGE_PERIOD);
    expect(await veaOutbox.veaInboxArbToEth()).to.equal(veaInbox.address);
    expect(await veaOutbox.bridge()).to.equal(bridge.address);
    // ReceiverGateway
    expect(await receiverGateway.veaOutbox()).to.equal(veaOutbox.address);

    expect(await receiverGateway.senderGateway()).to.equal(senderGateway.address);
  });

  describe("Honest Claim - No Challenge - Bridger Paid", async () => {
    it("should send the fastMessage", async () => {
      // sending sample data through the fast Bridge
      const data = 1121;
      for (let i = 0; i < 10; i++) {
        await senderGateway.sendMessage(data);
      }
      await veaInbox.connect(bridger).saveSnapshot();
    });

    it("should send the batch", async () => {
      // should revert if No messages have been sent yet.

      const data = 1121;
      await senderGateway.sendMessage(data);

      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / (await veaInbox.epochPeriod()).toNumber()
      );
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      expect(await veaInbox.snapshots(epoch)).equal(batchMerkleRoot);
    });

    it("should be able to claim", async () => {
      const data = 1121;
      await senderGateway.sendMessage(data);
      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epochPeriod = (await veaInbox.epochPeriod()).toNumber();
      const epoch = Math.floor((await batchOutGoingEvent[0].getBlock()).timestamp / epochPeriod);
      const batchMerkleRoot = await veaInbox.snapshots(epoch);
      const invalidEpoch = BigNumber.from(2).add(epoch);

      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");

      await expect(
        veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: ONE_HUNDREDTH_ETH })
      ).to.be.revertedWith("Insufficient claim deposit.");

      await expect(
        veaOutbox.connect(bridger).claim(epoch, ethers.constants.HashZero, { value: TEN_ETH })
      ).to.be.revertedWith("Invalid claim.");

      await expect(
        veaOutbox.connect(bridger).claim(invalidEpoch, batchMerkleRoot, { value: TEN_ETH })
      ).to.be.revertedWith("Invalid epoch.");

      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });

      await expect(bridgerClaimTx).to.emit(veaOutbox, "Claimed").withArgs(bridger.address, epoch, batchMerkleRoot);

      await expect(veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH })).to.be.revertedWith(
        "Claim already made."
      ); // should fail with this revert message.
    });

    it("should be able to verify batch", async () => {
      // should fail for invalid epochs

      await expect(
        veaOutbox.connect(bridger).verifySnapshot(0, {
          stateRoot: ethers.constants.HashZero,
          claimer: bridger.address,
          timestampClaimed: 0,
          timestampVerification: 0,
          blocknumberVerification: 0,
          honest: 0,
          challenger: challenger.address,
        })
      ).to.be.revertedWith("Invalid claim.");

      // sending sample data through the fast bridge
      const data = 1121;
      await senderGateway.sendMessage(data);
      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epochPeriod = (await veaInbox.epochPeriod()).toNumber();
      const epoch = Math.floor((await batchOutGoingEvent[0].getBlock()).timestamp / epochPeriod);

      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");

      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      // Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const blockClaim = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);

      // should revert as the challenge period has not passed
      await expect(
        veaOutbox.connect(bridger).startVerification(epoch, {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestampClaimed: blockClaim.timestamp,
          timestampVerification: 0,
          blocknumberVerification: 0,
          honest: 0,
          challenger: ethers.constants.AddressZero,
        })
      ).to.be.revertedWith("Claim must wait atleast maxL2StateSyncDelay.");

      const maxL2StateSyncDelay = (await veaOutbox.sequencerDelayLimit()).toNumber() + epochPeriod / 2;
      await network.provider.send("evm_increaseTime", [epochPeriod + maxL2StateSyncDelay]);
      await network.provider.send("evm_mine");

      const startValidationTxn = await veaOutbox.startVerification(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: blockClaim.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.constants.AddressZero,
      });
      await expect(startValidationTxn).to.emit(veaOutbox, "VerificationStarted").withArgs(epoch);

      const blockStartValidation = await ethers.provider.getBlock(startValidationTxn.blockNumber!);

      const minChallengePeriod = (await veaOutbox.minChallengePeriod()).toNumber();
      await network.provider.send("evm_increaseTime", [minChallengePeriod]);
      await network.provider.send("evm_mine");

      await expect(
        veaOutbox.verifySnapshot(epoch, {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestampClaimed: blockClaim.timestamp,
          timestampVerification: blockStartValidation.timestamp!,
          blocknumberVerification: startValidationTxn.blockNumber!,
          honest: 0,
          challenger: ethers.constants.AddressZero,
        })
      ).to.be.revertedWith("Censorship test not passed.");

      const blocksToMine = Math.ceil(minChallengePeriod / 12);
      await mine(blocksToMine);

      const verifySnapshotTxn = await veaOutbox.connect(bridger).verifySnapshot(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: blockClaim.timestamp,
        timestampVerification: blockStartValidation.timestamp!,
        blocknumberVerification: startValidationTxn.blockNumber!,
        honest: 0,
        challenger: ethers.constants.AddressZero,
      });

      expect(await veaOutbox.stateRoot()).to.equal(batchMerkleRoot);
    });

    it("should be able verify and relay message", async () => {
      // sending sample data through the fast bridge
      const data = 1121;
      const sendMessagetx = await senderGateway.sendMessage(data);
      //const inboxsnapshot = await veaInbox.inbox(0);

      const sendMessagetx2 = await senderGateway.sendMessage(data);
      //const inboxsnapshot2 = await veaInbox.inbox(0);
      await expect(sendMessagetx).to.emit(veaInbox, "MessageSent");
      const MessageSent = veaInbox.filters.MessageSent();
      const MessageSentEvent = await veaInbox.queryFilter(MessageSent);
      const msg = MessageSentEvent[0].args._nodeData;

      const nonce = "0x" + msg.slice(2, 18);
      const to = "0x" + msg.slice(18, 58); //18+40
      const msgData = "0x" + msg.slice(58);

      const msg2 = MessageSentEvent[1].args._nodeData;

      let nodes: string[] = [];

      const nonce2 = "0x" + msg2.slice(2, 18);
      const to2 = "0x" + msg2.slice(18, 58); //18+40
      const msgData2 = "0x" + msg2.slice(58);

      nodes.push(MerkleTree.makeLeafNode(nonce, to, msgData));
      nodes.push(MerkleTree.makeLeafNode(nonce2, to2, msgData2));

      const sendBatchTx = await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / (await veaInbox.epochPeriod()).toNumber()
      );
      const batchMerkleRoot = await veaInbox.snapshots(epoch);
      // Honest Bridger
      const epochPeriod = (await veaInbox.epochPeriod()).toNumber();

      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");

      // Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const blockClaim = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);

      const maxL2StateSyncDelay = (await veaOutbox.sequencerDelayLimit()).toNumber() + epochPeriod / 2;
      await network.provider.send("evm_increaseTime", [epochPeriod + maxL2StateSyncDelay]);
      await network.provider.send("evm_mine");

      const startValidationTxn = await veaOutbox.startVerification(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: blockClaim.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.constants.AddressZero,
      });
      await expect(startValidationTxn).to.emit(veaOutbox, "VerificationStarted").withArgs(epoch);

      const blockStartValidation = await ethers.provider.getBlock(startValidationTxn.blockNumber!);

      const minChallengePeriod = (await veaOutbox.minChallengePeriod()).toNumber();
      await network.provider.send("evm_increaseTime", [minChallengePeriod]);
      await network.provider.send("evm_mine");
      const blocksToMine = Math.ceil(minChallengePeriod / 12);
      await mine(blocksToMine);

      const verifySnapshotTxn = await veaOutbox.connect(bridger).verifySnapshot(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: blockClaim.timestamp,
        timestampVerification: blockStartValidation.timestamp!,
        blocknumberVerification: startValidationTxn.blockNumber!,
        honest: 0,
        challenger: ethers.constants.AddressZero,
      });

      const mt = new MerkleTree(nodes);
      await expect(veaOutbox.connect(relayer).sendMessage([], nonce, to, msgData)).to.be.revertedWith("Invalid proof.");
      const proof = mt.getHexProof(nodes[0]);

      const verifyAndRelayTx = await veaOutbox.connect(relayer).sendMessage(proof, nonce, to, msgData);
      await expect(verifyAndRelayTx).to.emit(veaOutbox, "MessageRelayed").withArgs(0);

      await expect(veaOutbox.connect(relayer).sendMessage(proof, nonce, to, msgData)).to.be.revertedWith(
        "Message already relayed"
      );
    });

    it("should allow bridger to claim deposit", async () => {
      // sending sample data through the fast bridge
      const data = 1121;
      const sendMessagetx = await senderGateway.sendMessage(data);

      await expect(sendMessagetx).to.emit(veaInbox, "MessageSent");
      const MessageSent = veaInbox.filters.MessageSent();
      const MessageSentEvent = await veaInbox.queryFilter(MessageSent);
      const msg = MessageSentEvent[0].args._nodeData;
      const nonce = "0x" + msg.slice(2, 18);
      const to = "0x" + msg.slice(18, 58); //18+40
      const msgData = "0x" + msg.slice(58);

      let nodes: string[] = [];
      nodes.push(MerkleTree.makeLeafNode(nonce, to, msgData));

      const mt = new MerkleTree(nodes);
      const proof = mt.getHexProof(nodes[nodes.length - 1]);

      const sendBatchTx = await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / (await veaInbox.epochPeriod()).toNumber()
      );
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      const epochPeriod = (await veaInbox.epochPeriod()).toNumber();

      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");

      // Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const blockClaim = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);

      const maxL2StateSyncDelay = (await veaOutbox.sequencerDelayLimit()).toNumber() + epochPeriod / 2;
      await network.provider.send("evm_increaseTime", [epochPeriod + maxL2StateSyncDelay]);
      await network.provider.send("evm_mine");

      const startValidationTxn = await veaOutbox.startVerification(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: blockClaim.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.constants.AddressZero,
      });
      await expect(startValidationTxn).to.emit(veaOutbox, "VerificationStarted").withArgs(epoch);

      const blockStartValidation = await ethers.provider.getBlock(startValidationTxn.blockNumber!);

      const minChallengePeriod = (await veaOutbox.minChallengePeriod()).toNumber();
      await network.provider.send("evm_increaseTime", [minChallengePeriod]);
      await network.provider.send("evm_mine");
      const blocksToMine = Math.ceil(minChallengePeriod / 12);
      await mine(blocksToMine);

      const verifySnapshotTxn = await veaOutbox.connect(bridger).verifySnapshot(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: blockClaim.timestamp,
        timestampVerification: blockStartValidation.timestamp!,
        blocknumberVerification: startValidationTxn.blockNumber!,
        honest: 0,
        challenger: ethers.constants.AddressZero,
      });

      const verifyAndRelayTx = await veaOutbox.connect(relayer).sendMessage(proof, 0, to, msgData);
      await expect(verifyAndRelayTx).to.emit(veaOutbox, "MessageRelayed").withArgs(0);

      const withdrawClaimDepositTx = await veaOutbox.connect(bridger).withdrawClaimDeposit(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: blockClaim.timestamp,
        timestampVerification: blockStartValidation.timestamp!,
        blocknumberVerification: startValidationTxn.blockNumber!,
        honest: 1,
        challenger: ethers.constants.AddressZero,
      });
    });

    it("should not allow challenger to withdraw deposit - as challenge doesn't exist", async () => {
      // sending sample data through the fast bridge
      const data = 1121;
      const sendMessagetx = await senderGateway.sendMessage(data);

      await expect(sendMessagetx).to.emit(veaInbox, "MessageSent");
      const MessageSent = veaInbox.filters.MessageSent();
      const MessageSentEvent = await veaInbox.queryFilter(MessageSent);
      const msg = MessageSentEvent[0].args._nodeData;
      const nonce = "0x" + msg.slice(2, 18);
      const to = "0x" + msg.slice(18, 58); //18+40
      const msgData = "0x" + msg.slice(58);

      let nodes: string[] = [];
      nodes.push(MerkleTree.makeLeafNode(nonce, to, msgData));

      const mt = new MerkleTree(nodes);
      const proof = mt.getHexProof(nodes[nodes.length - 1]);

      const sendBatchTx = await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / (await veaInbox.epochPeriod()).toNumber()
      );
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      const epochPeriod = (await veaInbox.epochPeriod()).toNumber();

      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");

      // Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const blockClaim = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);

      const maxL2StateSyncDelay = (await veaOutbox.sequencerDelayLimit()).toNumber() + epochPeriod / 2;
      await network.provider.send("evm_increaseTime", [epochPeriod + maxL2StateSyncDelay]);
      await network.provider.send("evm_mine");

      const startValidationTxn = await veaOutbox.startVerification(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: blockClaim.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.constants.AddressZero,
      });
      await expect(startValidationTxn).to.emit(veaOutbox, "VerificationStarted").withArgs(epoch);

      const blockStartValidation = await ethers.provider.getBlock(startValidationTxn.blockNumber!);

      const minChallengePeriod = (await veaOutbox.minChallengePeriod()).toNumber();
      await network.provider.send("evm_increaseTime", [minChallengePeriod]);
      await network.provider.send("evm_mine");
      const blocksToMine = Math.ceil(minChallengePeriod / 12);
      await mine(blocksToMine);

      const verifySnapshotTxn = await veaOutbox.connect(bridger).verifySnapshot(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: blockClaim.timestamp,
        timestampVerification: blockStartValidation.timestamp!,
        blocknumberVerification: startValidationTxn.blockNumber!,
        honest: 0,
        challenger: ethers.constants.AddressZero,
      });

      const verifyAndRelayTx = await veaOutbox.connect(relayer).sendMessage(proof, 0, to, msgData);
      await expect(verifyAndRelayTx).to.emit(veaOutbox, "MessageRelayed").withArgs(0);

      const withdrawClaimDepositTx = await veaOutbox.withdrawClaimDeposit(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: blockClaim.timestamp,
        timestampVerification: blockStartValidation.timestamp!,
        blocknumberVerification: startValidationTxn.blockNumber!,
        honest: 1,
        challenger: ethers.constants.AddressZero,
      });
    });
  });

  describe("Honest Claim - Dishonest Challenge - Bridger paid, challenger deposit forfeited", async () => {
    // most of the functions are tested thoroughly in the above test case
    // only challenge related functionality are tested here

    it("should be able to challenge", async () => {
      const data = 1121;
      const sendMessagetx = await senderGateway.sendMessage(data);
      const sendBatchTx = await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epochPeriod = (await veaInbox.epochPeriod()).toNumber();
      const epoch = Math.floor((await batchOutGoingEvent[0].getBlock()).timestamp / epochPeriod);
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");

      // bridger tx starts - Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);

      const challengeTx = await veaOutbox
        .connect(challenger)
        ["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](
          epoch,
          {
            stateRoot: batchMerkleRoot,
            claimer: bridger.address,
            timestampClaimed: block.timestamp,
            timestampVerification: 0,
            blocknumberVerification: 0,
            honest: 0,
            challenger: ethers.constants.AddressZero,
          },
          { value: TEN_ETH }
        );

      await expect(challengeTx).to.emit(veaOutbox, "Challenged").withArgs(epoch, challenger.address);
    });

    it("should be able to fallback to send safe", async () => {
      const data = 1121;

      const sendMessagetx = await senderGateway.sendMessage(data);
      const sendBatchTx = await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epochPeriod = (await veaInbox.epochPeriod()).toNumber();
      const epoch = Math.floor((await batchOutGoingEvent[0].getBlock()).timestamp / epochPeriod);
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");

      // bridger tx starts - Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);

      const challengeTx = await veaOutbox
        .connect(challenger)
        ["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](
          epoch,
          {
            stateRoot: batchMerkleRoot,
            claimer: bridger.address,
            timestampClaimed: block.timestamp,
            timestampVerification: 0,
            blocknumberVerification: 0,
            honest: 0,
            challenger: ethers.constants.AddressZero,
          },
          { value: TEN_ETH }
        );

      const sendSafeFallbackTx = await veaInbox.connect(bridger).sendSnapshot(
        epoch,
        {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestampClaimed: block.timestamp,
          timestampVerification: 0,
          blocknumberVerification: 0,
          honest: 0,
          challenger: challenger.address,
        },
        { gasLimit: 1000000 }
      );
      await expect(sendSafeFallbackTx)
        .to.emit(veaInbox, "SnapshotSent")
        .withArgs(epoch, ethers.utils.formatBytes32String("")); // ticketId is always 0x00..0
    });

    it("challenger's deposit should be forfeited", async () => {
      // sample data
      const data = 1121;

      const sendMessagetx = await senderGateway.sendMessage(data);
      await expect(sendMessagetx).to.emit(veaInbox, "MessageSent");
      const MessageSent = veaInbox.filters.MessageSent();
      const MessageSentEvent = await veaInbox.queryFilter(MessageSent);
      const msg = MessageSentEvent[0].args._nodeData;
      const nonce = "0x" + msg.slice(2, 18);
      const to = "0x" + msg.slice(18, 58); //18+40
      const msgData = "0x" + msg.slice(58);

      let nodes: string[] = [];
      nodes.push(MerkleTree.makeLeafNode(nonce, to, msgData));

      const mt = new MerkleTree(nodes);
      const proof = mt.getHexProof(nodes[nodes.length - 1]);

      const sendBatchTx = await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epochPeriod = (await veaInbox.epochPeriod()).toNumber();
      const epoch = Math.floor((await batchOutGoingEvent[0].getBlock()).timestamp / epochPeriod);
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");

      // bridger tx starts - Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);

      // withdraw challenge deposit should revert for invalid epoch
      await expect(
        veaOutbox.connect(challenger).withdrawChallengeDeposit(epoch, {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestampClaimed: block.timestamp,
          timestampVerification: 0,
          blocknumberVerification: 0,
          honest: 0,
          challenger: ethers.constants.AddressZero,
        })
      ).to.be.revertedWith("Challenge failed.");

      const maxL2StateSyncDelay = (await veaOutbox.sequencerDelayLimit()).toNumber() + epochPeriod / 2;
      await network.provider.send("evm_increaseTime", [epochPeriod + maxL2StateSyncDelay]);
      await network.provider.send("evm_mine");

      const startValidationTxn = await veaOutbox.startVerification(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: block.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.constants.AddressZero,
      });
      await expect(startValidationTxn).to.emit(veaOutbox, "VerificationStarted").withArgs(epoch);

      const blockStartValidation = await ethers.provider.getBlock(startValidationTxn.blockNumber!);

      const minChallengePeriod = (await veaOutbox.minChallengePeriod()).toNumber();
      await network.provider.send("evm_increaseTime", [minChallengePeriod]);
      await network.provider.send("evm_mine");
      const blocksToMine = Math.ceil(minChallengePeriod / 12);
      await mine(blocksToMine);

      // Challenger tx starts
      const challengeTx = await veaOutbox
        .connect(challenger)
        ["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](
          epoch,
          {
            stateRoot: batchMerkleRoot,
            claimer: bridger.address,
            timestampClaimed: block.timestamp,
            timestampVerification: blockStartValidation.timestamp!,
            blocknumberVerification: startValidationTxn.blockNumber!,
            honest: 0,
            challenger: ethers.constants.AddressZero,
          },
          { value: TEN_ETH }
        );
      await expect(challengeTx).to.emit(veaOutbox, "Challenged").withArgs(epoch, challenger.address);

      await expect(
        veaOutbox.connect(relayer).verifySnapshot(epoch, {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestampClaimed: block.timestamp,
          timestampVerification: blockStartValidation.timestamp!,
          blocknumberVerification: startValidationTxn.blockNumber!,
          honest: 0,
          challenger: challenger.address,
        })
      ).revertedWith("Claim is challenged.");

      //expect(await (await veaOutbox.challenges(epoch)).honest).to.equal(false);
      const sendSafeFallbackTx = await veaInbox.connect(bridger).sendSnapshot(
        epoch,
        {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestampClaimed: block.timestamp,
          timestampVerification: blockStartValidation.timestamp!,
          blocknumberVerification: startValidationTxn.blockNumber!,
          honest: 0,
          challenger: challenger.address,
        },
        { gasLimit: 1000000 }
      );
      //expect(await (await veaOutbox.challenges(epoch)).honest).to.equal(false);
      //expect(await (await veaOutbox.claims(epoch)).honest).to.equal(true);
      const verifyAndRelayTx = await veaOutbox.connect(relayer).sendMessage(proof, 0, to, msgData);
      await expect(verifyAndRelayTx).to.emit(veaOutbox, "MessageRelayed").withArgs(0);
      await expect(
        veaOutbox.withdrawChallengeDeposit(epoch, {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestampClaimed: block.timestamp,
          timestampVerification: blockStartValidation.timestamp!,
          blocknumberVerification: startValidationTxn.blockNumber!,
          honest: 1,
          challenger: challenger.address,
        })
      ).to.be.revertedWith("Challenge failed.");

      const withdrawClaimDepositTx = await veaOutbox.withdrawClaimDeposit(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: block.timestamp,
        timestampVerification: blockStartValidation.timestamp!,
        blocknumberVerification: startValidationTxn.blockNumber!,
        honest: 1,
        challenger: challenger.address,
      });
    });
  });

  describe("Dishonest Claim - Honest Challenge - Bridger deposit forfeited, Challenger paid", async () => {
    it("Bridger deposit forfeited, Challenger paid", async () => {
      const data = 1121;

      const sendMessagetx = await senderGateway.sendMessage(data);
      await expect(sendMessagetx).to.emit(veaInbox, "MessageSent");
      const MessageSent = veaInbox.filters.MessageSent();
      const MessageSentEvent = await veaInbox.queryFilter(MessageSent);
      const msg = MessageSentEvent[0].args._nodeData;
      const nonce = "0x" + msg.slice(2, 18);
      const to = "0x" + msg.slice(18, 58); //18+40
      const msgData = "0x" + msg.slice(58);

      let nodes: string[] = [];
      nodes.push(MerkleTree.makeLeafNode(nonce, to, msgData));

      const mt = new MerkleTree(nodes);
      const proof = mt.getHexProof(nodes[nodes.length - 1]);

      const sendBatchTx = await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / (await veaInbox.epochPeriod()).toNumber()
      );
      const epochPeriod = (await veaOutbox.epochPeriod()).toNumber();

      const batchMerkleRoot = await veaInbox.snapshots(epoch);
      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");
      // bridger tx starts - bridger creates fakeData & fakeHash

      const fakeData = "KlerosToTheMoon";
      const fakeHash = utils.keccak256(utils.defaultAbiCoder.encode(["string"], [fakeData]));
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, fakeHash, { value: TEN_ETH });
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);

      const maxL2StateSyncDelay = (await veaOutbox.sequencerDelayLimit()).toNumber() + epochPeriod / 2;
      await network.provider.send("evm_increaseTime", [epochPeriod + maxL2StateSyncDelay]);
      await network.provider.send("evm_mine");

      // Validation starts
      const startValidationTxn = await veaOutbox.startVerification(epoch, {
        stateRoot: fakeHash,
        claimer: bridger.address,
        timestampClaimed: block.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.constants.AddressZero,
      });
      await expect(startValidationTxn).to.emit(veaOutbox, "VerificationStarted").withArgs(epoch);
      const blockStartValidation = await ethers.provider.getBlock(startValidationTxn.blockNumber!);

      const minChallengePeriod = (await veaOutbox.minChallengePeriod()).toNumber();
      await network.provider.send("evm_increaseTime", [minChallengePeriod]);
      await network.provider.send("evm_mine");
      const blocksToMine = Math.ceil(minChallengePeriod / 12);
      await mine(blocksToMine);

      // Challenger tx starts
      const challengeTx = await veaOutbox
        .connect(challenger)
        ["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](
          epoch,
          {
            stateRoot: fakeHash,
            claimer: bridger.address,
            timestampClaimed: block.timestamp,
            timestampVerification: blockStartValidation.timestamp!,
            blocknumberVerification: startValidationTxn.blockNumber!,
            honest: 0,
            challenger: ethers.constants.AddressZero,
          },
          { value: TEN_ETH }
        );

      await expect(
        veaOutbox.connect(relayer).verifySnapshot(epoch, {
          stateRoot: fakeHash,
          claimer: bridger.address,
          timestampClaimed: block.timestamp,
          timestampVerification: blockStartValidation.timestamp!,
          blocknumberVerification: startValidationTxn.blockNumber!,
          honest: 0,
          challenger: challenger.address,
        })
      ).to.revertedWith("Claim is challenged.");

      // sendSafeFallback internally calls the verifySafeBatch
      const sendSafeFallbackTx = await veaInbox.connect(bridger).sendSnapshot(
        epoch,
        {
          stateRoot: fakeHash,
          claimer: bridger.address,
          timestampClaimed: block.timestamp,
          timestampVerification: blockStartValidation.timestamp!,
          blocknumberVerification: startValidationTxn.blockNumber!,
          honest: 0,
          challenger: challenger.address,
        },
        { gasLimit: 1000000 }
      );
      const verifyAndRelayTx = await veaOutbox.connect(relayer).sendMessage(proof, 0, to, msgData);
      await expect(verifyAndRelayTx).to.emit(veaOutbox, "MessageRelayed").withArgs(0);
      expect(
        veaOutbox.connect(relayer).withdrawClaimDeposit(epoch, {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestampClaimed: block.timestamp,
          timestampVerification: blockStartValidation.timestamp!,
          blocknumberVerification: startValidationTxn.blockNumber!,
          honest: 2,
          challenger: challenger.address,
        })
      ).to.be.revertedWith("Claim failed.");

      await expect(
        veaOutbox.connect(relayer).withdrawChallengeDeposit(epoch, {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestampClaimed: block.timestamp,
          timestampVerification: blockStartValidation.timestamp!,
          blocknumberVerification: startValidationTxn.blockNumber!,
          honest: 2,
          challenger: challenger.address,
        })
      );
    });

    it("should update latest verified epoch and state root correctly after dispute resolution", async () => {
      const data = 1121;

      const sendMessagetx = await senderGateway.sendMessage(data);
      await expect(sendMessagetx).to.emit(veaInbox, "MessageSent");
      const MessageSent = veaInbox.filters.MessageSent();
      const MessageSentEvent = await veaInbox.queryFilter(MessageSent);
      const msg = MessageSentEvent[0].args._nodeData;
      const nonce = "0x" + msg.slice(2, 18);
      const to = "0x" + msg.slice(18, 58); //18+40
      const msgData = "0x" + msg.slice(58);

      let nodes: string[] = [];
      nodes.push(MerkleTree.makeLeafNode(nonce, to, msgData));

      const mt = new MerkleTree(nodes);
      const proof = mt.getHexProof(nodes[nodes.length - 1]);

      const sendBatchTx = await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / (await veaInbox.epochPeriod()).toNumber()
      );
      const epochPeriod = (await veaOutbox.epochPeriod()).toNumber();

      const batchMerkleRoot = await veaInbox.snapshots(epoch);
      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");
      // bridger tx starts - bridger creates fakeData & fakeHash

      const fakeData = "KlerosToTheMoon";
      const fakeHash = utils.keccak256(utils.defaultAbiCoder.encode(["string"], [fakeData]));
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, fakeHash, { value: TEN_ETH });
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);

      const maxL2StateSyncDelay = (await veaOutbox.sequencerDelayLimit()).toNumber() + epochPeriod / 2;
      await network.provider.send("evm_increaseTime", [epochPeriod + maxL2StateSyncDelay]);
      await network.provider.send("evm_mine");

      // Validation starts
      const startValidationTxn = await veaOutbox.startVerification(epoch, {
        stateRoot: fakeHash,
        claimer: bridger.address,
        timestampClaimed: block.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.constants.AddressZero,
      });
      await expect(startValidationTxn).to.emit(veaOutbox, "VerificationStarted").withArgs(epoch);
      const blockStartValidation = await ethers.provider.getBlock(startValidationTxn.blockNumber!);

      const minChallengePeriod = (await veaOutbox.minChallengePeriod()).toNumber();
      await network.provider.send("evm_increaseTime", [minChallengePeriod]);
      await network.provider.send("evm_mine");
      const blocksToMine = Math.ceil(minChallengePeriod / 12);
      await mine(blocksToMine);

      // Challenger tx starts
      const challengeTx = await veaOutbox
        .connect(challenger)
        ["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](
          epoch,
          {
            stateRoot: fakeHash,
            claimer: bridger.address,
            timestampClaimed: block.timestamp,
            timestampVerification: blockStartValidation.timestamp!,
            blocknumberVerification: startValidationTxn.blockNumber!,
            honest: 0,
            challenger: ethers.constants.AddressZero,
          },
          { value: TEN_ETH }
        );

      await expect(
        veaOutbox.connect(relayer).verifySnapshot(epoch, {
          stateRoot: fakeHash,
          claimer: bridger.address,
          timestampClaimed: block.timestamp,
          timestampVerification: blockStartValidation.timestamp!,
          blocknumberVerification: startValidationTxn.blockNumber!,
          honest: 0,
          challenger: challenger.address,
        })
      ).to.revertedWith("Claim is challenged.");

      // sendSafeFallback internally calls the verifySafeBatch
      const sendSafeFallbackTx = await veaInbox.connect(bridger).sendSnapshot(
        epoch,
        {
          stateRoot: fakeHash,
          claimer: bridger.address,
          timestampClaimed: block.timestamp,
          timestampVerification: blockStartValidation.timestamp!,
          blocknumberVerification: startValidationTxn.blockNumber!,
          honest: 0,
          challenger: challenger.address,
        },
        { gasLimit: 1000000 }
      );

      const latestVerifiedEpoch = await veaOutbox.latestVerifiedEpoch();
      expect(latestVerifiedEpoch).to.equal(epoch);

      const stateRoot = await veaOutbox.stateRoot();
      expect(stateRoot).to.equal(batchMerkleRoot);
    });

    it("should not update latest verified epoch and state root after dispute resolution", async () => {
      const data = 1121;

      const sendMessagetx = await senderGateway.sendMessage(data);
      await expect(sendMessagetx).to.emit(veaInbox, "MessageSent");
      const sendBatchTx = await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / (await veaInbox.epochPeriod()).toNumber()
      );
      const stateRoot1 = await veaInbox.snapshots(epoch);
      const epochPeriod = (await veaOutbox.epochPeriod()).toNumber();
      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");

      // bridger tx starts - bridger creates fakeData & fakeHash
      const fakeData = "KlerosToTheMoon";
      const fakeHash = utils.keccak256(utils.defaultAbiCoder.encode(["string"], [fakeData]));
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, fakeHash, { value: TEN_ETH });
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);

      const maxL2StateSyncDelay = (await veaOutbox.sequencerDelayLimit()).toNumber() + epochPeriod / 2;
      await network.provider.send("evm_increaseTime", [epochPeriod + maxL2StateSyncDelay]);
      await network.provider.send("evm_mine");

      // Validation starts
      const startValidationTxn = await veaOutbox.startVerification(epoch, {
        stateRoot: fakeHash,
        claimer: bridger.address,
        timestampClaimed: block.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.constants.AddressZero,
      });
      await expect(startValidationTxn).to.emit(veaOutbox, "VerificationStarted").withArgs(epoch);

      const blockStartValidation = await ethers.provider.getBlock(startValidationTxn.blockNumber!);
      const minChallengePeriod = (await veaOutbox.minChallengePeriod()).toNumber();

      await network.provider.send("evm_increaseTime", [minChallengePeriod]);
      await network.provider.send("evm_mine");
      const blocksToMine = Math.ceil(minChallengePeriod / 12);
      await mine(blocksToMine);

      // Challenger tx starts
      const challengeTx = await veaOutbox
        .connect(challenger)
        ["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](
          epoch,
          {
            stateRoot: fakeHash,
            claimer: bridger.address,
            timestampClaimed: block.timestamp,
            timestampVerification: blockStartValidation.timestamp!,
            blocknumberVerification: startValidationTxn.blockNumber!,
            honest: 0,
            challenger: ethers.constants.AddressZero,
          },
          { value: TEN_ETH }
        );

      // 2nd message at new epoch
      const epoch2 = await veaOutbox.epochNow();

      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");

      const stateRoot2 = ethers.utils.keccak256(ethers.utils.keccak256(ethers.utils.toUtf8Bytes("stateRoot2")));
      const claimTxn2 = await veaOutbox.connect(bridger).claim(epoch2, stateRoot2, { value: TEN_ETH });
      const claimTxn2Block = await ethers.provider.getBlock(claimTxn2.blockNumber!);

      await network.provider.send("evm_increaseTime", [maxL2StateSyncDelay + epochPeriod]);
      await network.provider.send("evm_mine");

      const startValidationTxn2 = await veaOutbox.startVerification(epoch2, {
        stateRoot: stateRoot2,
        claimer: bridger.address,
        timestampClaimed: claimTxn2Block.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.constants.AddressZero,
      });

      const blockStartValidation2 = await ethers.provider.getBlock(startValidationTxn2.blockNumber!);
      await network.provider.send("evm_increaseTime", [minChallengePeriod]);
      await network.provider.send("evm_mine");
      await mine(blocksToMine);

      const verifySnapshotTxn = await veaOutbox.connect(bridger).verifySnapshot(epoch2, {
        stateRoot: stateRoot2,
        claimer: bridger.address,
        timestampClaimed: claimTxn2Block.timestamp,
        timestampVerification: blockStartValidation2.timestamp!,
        blocknumberVerification: startValidationTxn2.blockNumber!,
        honest: 0,
        challenger: ethers.constants.AddressZero,
      });

      // Resolve dispute
      const sendSafeFallbackTx = await veaInbox.connect(bridger).sendSnapshot(
        epoch,
        {
          stateRoot: fakeHash,
          claimer: bridger.address,
          timestampClaimed: block.timestamp,
          timestampVerification: blockStartValidation.timestamp!,
          blocknumberVerification: startValidationTxn.blockNumber!,
          honest: 0,
          challenger: challenger.address,
        },
        { gasLimit: 1000000 }
      );

      // Verify dispute resolution
      const latestStateRoot = await veaOutbox.stateRoot();
      expect(latestStateRoot).not.equal(stateRoot1);
      expect(latestStateRoot).to.equal(stateRoot2);

      const latestVerifiedEpoch = await veaOutbox.latestVerifiedEpoch();
      expect(latestVerifiedEpoch).to.equal(epoch2);
    });
  });
});

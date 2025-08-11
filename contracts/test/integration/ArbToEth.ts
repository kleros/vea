import { expect } from "chai";
import { deployments, ethers, getNamedAccounts, network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
const { mine } = require("@nomicfoundation/hardhat-network-helpers");

import {
  VeaOutboxMockArbToEth as VeaOutboxMock,
  ReceiverGatewayMock,
  VeaInboxMockArbToEth as VeaInboxMock,
  SenderGatewayMock,
  BridgeMock,
  ArbSysMock,
} from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import "@nomicfoundation/hardhat-chai-matchers";
import { MerkleTree } from "../merkle/MerkleTree";

/* eslint-disable no-unused-vars */
/* eslint-disable no-unused-expressions */ // https://github.com/standard/standard/issues/690#issuecomment-278533482

const ONE_HUNDREDTH_ETH = 10n ** 16n;
const ONE_TENTH_ETH = 10n ** 17n;
const ONE_ETH = 10n ** 18n;
const TEN_ETH = 10n ** 19n;
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
    await receiverGateway.allowlistSender(true);
  });

  it("should initialize contracts correctly", async () => {
    // Sender Gateway
    expect(await senderGateway.veaInbox()).to.equal(veaInbox.target);
    expect(await senderGateway.receiverGateway()).to.equal(receiverGateway.target);

    // veaInbox
    expect(await veaInbox.arbSys()).to.equal(arbsysMock.target);
    expect(await veaInbox.epochPeriod()).to.equal(EPOCH_PERIOD);
    expect(await veaInbox.veaOutboxArbToEth()).to.equal(veaOutbox.target);

    // veaOutbox
    expect(await veaOutbox.deposit()).to.equal(TEN_ETH);
    expect(await veaOutbox.epochPeriod()).to.equal(EPOCH_PERIOD);
    expect(await veaOutbox.minChallengePeriod()).to.equal(CHALLENGE_PERIOD);
    expect(await veaOutbox.veaInboxArbToEth()).to.equal(veaInbox.target);
    expect(await veaOutbox.bridge()).to.equal(bridge.target);
    // ReceiverGateway
    expect(await receiverGateway.veaOutbox()).to.equal(veaOutbox.target);

    expect(await receiverGateway.senderGateway()).to.equal(senderGateway.target);
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
        (await batchOutGoingEvent[0].getBlock()).timestamp / Number(await veaInbox.epochPeriod())
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
      const epochPeriod = Number(await veaInbox.epochPeriod());
      const epoch = Math.floor((await batchOutGoingEvent[0].getBlock()).timestamp / epochPeriod);
      const batchMerkleRoot = await veaInbox.snapshots(epoch);
      const invalidEpoch = 2 + epoch;

      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");

      await expect(
        veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: ONE_HUNDREDTH_ETH })
      ).to.be.revertedWith("Insufficient claim deposit.");

      await expect(veaOutbox.connect(bridger).claim(epoch, ethers.ZeroHash, { value: TEN_ETH })).to.be.revertedWith(
        "Invalid claim."
      );

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
          stateRoot: ethers.ZeroHash,
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
      const epochPeriod = Number(await veaInbox.epochPeriod());
      const epoch = Math.floor((await batchOutGoingEvent[0].getBlock()).timestamp / epochPeriod);

      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");

      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      // Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const blockClaim = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);
      if (!blockClaim) return;

      // should revert as the challenge period has not passed
      await expect(
        veaOutbox.connect(bridger).startVerification(epoch, {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestampClaimed: blockClaim.timestamp,
          timestampVerification: 0,
          blocknumberVerification: 0,
          honest: 0,
          challenger: ethers.ZeroAddress,
        })
      ).to.be.revertedWith("Claim must wait atleast maxL2StateSyncDelay.");

      const maxL2StateSyncDelay = Number(await veaOutbox.sequencerDelayLimit()) + epochPeriod / 2;
      await network.provider.send("evm_increaseTime", [epochPeriod + maxL2StateSyncDelay]);
      await network.provider.send("evm_mine");

      const startValidationTxn = await veaOutbox.startVerification(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: blockClaim.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.ZeroAddress,
      });
      await expect(startValidationTxn).to.emit(veaOutbox, "VerificationStarted").withArgs(epoch);

      const blockStartValidation = await ethers.provider.getBlock(startValidationTxn.blockNumber!);
      if (!blockStartValidation) return;
      const minChallengePeriod = Number(await veaOutbox.minChallengePeriod());
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
          challenger: ethers.ZeroAddress,
        })
      ).to.be.revertedWith("Censorship test not passed.");

      const blocksToMine = Math.ceil(minChallengePeriod / 12);
      await mine(blocksToMine);

      await veaOutbox.connect(bridger).verifySnapshot(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: blockClaim.timestamp,
        timestampVerification: blockStartValidation.timestamp!,
        blocknumberVerification: startValidationTxn.blockNumber!,
        honest: 0,
        challenger: ethers.ZeroAddress,
      });

      expect(await veaOutbox.stateRoot()).to.equal(batchMerkleRoot);
    });

    it("should be able verify and relay message", async () => {
      // sending sample data through the fast bridge
      const data = 1121;
      const sendMessagetx = await senderGateway.sendMessage(data);

      await senderGateway.sendMessage(data);
      await expect(sendMessagetx).to.emit(veaInbox, "MessageSent");
      const MessageSent = veaInbox.filters.MessageSent();
      const MessageSentEvent = await veaInbox.queryFilter(MessageSent);
      const msg = MessageSentEvent[0].args._nodeData;

      const { nonce, to, from, msgData } = decodeMessage(msg);

      const msg2 = MessageSentEvent[1].args._nodeData;

      let nodes: string[] = [];

      const nonce2 = "0x" + msg2.slice(2, 18);
      const to2 = "0x" + msg2.slice(18, 58); //18+40
      const from2 = "0x" + msg2.slice(58, 98); //58+40
      const msgData2 = "0x" + msg2.slice(98);

      nodes.push(MerkleTree.makeLeafNode(nonce, to, from, msgData));
      nodes.push(MerkleTree.makeLeafNode(nonce2, to2, from2, msgData2));

      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / Number(await veaInbox.epochPeriod())
      );
      const batchMerkleRoot = await veaInbox.snapshots(epoch);
      // Honest Bridger
      await claimAndVerify({
        veaInbox,
        veaOutbox,
        bridger,
        epoch,
        batchMerkleRoot,
        ethers,
        network,
        mine,
      });
      const mt = new MerkleTree(nodes);
      await expect(veaOutbox.connect(relayer).sendMessage([], nonce, to, from, msgData)).to.be.revertedWith(
        "Invalid proof."
      );
      const proof = mt.getHexProof(nodes[0]);

      const verifyAndRelayTx = await veaOutbox.connect(relayer).sendMessage(proof, nonce, to, from, msgData);
      await expect(verifyAndRelayTx).to.emit(veaOutbox, "MessageRelayed").withArgs(0);

      await expect(veaOutbox.connect(relayer).sendMessage(proof, nonce, to, from, msgData)).to.be.revertedWith(
        "Message already relayed"
      );
    });

    it("should be able to verify but not relay message", async () => {
      // Disabling the allowlist for the sender enable in beforeEach hook (default is false)
      await receiverGateway.allowlistSender(false);
      // sending sample data through the fast bridge
      const data = 1121;
      const sendMessagetx = await senderGateway.sendMessage(data);

      await senderGateway.sendMessage(data);
      await expect(sendMessagetx).to.emit(veaInbox, "MessageSent");
      const MessageSent = veaInbox.filters.MessageSent();
      const MessageSentEvent = await veaInbox.queryFilter(MessageSent);
      const msg = MessageSentEvent[0].args._nodeData;

      const { nonce, to, from, msgData } = decodeMessage(msg);

      const msg2 = MessageSentEvent[1].args._nodeData;

      let nodes: string[] = [];

      const nonce2 = "0x" + msg2.slice(2, 18);
      const to2 = "0x" + msg2.slice(18, 58); //18+40
      const from2 = "0x" + msg2.slice(58, 98); //58+40
      const msgData2 = "0x" + msg2.slice(98);

      nodes.push(MerkleTree.makeLeafNode(nonce, to, from, msgData));
      nodes.push(MerkleTree.makeLeafNode(nonce2, to2, from2, msgData2));

      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / Number(await veaInbox.epochPeriod())
      );
      const batchMerkleRoot = await veaInbox.snapshots(epoch);
      // Honest Bridger
      await claimAndVerify({
        veaInbox,
        veaOutbox,
        bridger,
        epoch,
        batchMerkleRoot,
        ethers,
        network,
        mine,
      });

      const mt = new MerkleTree(nodes);
      const proof = mt.getHexProof(nodes[0]);

      await expect(veaOutbox.connect(relayer).sendMessage(proof, nonce, to, from, msgData)).to.be.revertedWith(
        "Message sender not allowed to call receiver."
      );
    });

    it("should be able to verify and relay message with dynamic array", async () => {
      // sending sample data through the fast bridge
      const data = [1121, 1122, 1123, 1124, 1125];
      const sendMessagetx = await senderGateway.sendMessageArray(data);
      //const inboxsnapshot = await veaInbox.inbox(0);

      await senderGateway.sendMessageArray(data);
      //const inboxsnapshot2 = await veaInbox.inbox(0);
      await expect(sendMessagetx).to.emit(veaInbox, "MessageSent");
      const MessageSent = veaInbox.filters.MessageSent();
      const MessageSentEvent = await veaInbox.queryFilter(MessageSent);
      const msg = MessageSentEvent[0].args._nodeData;

      const { nonce, to, from, msgData } = decodeMessage(msg);

      const msg2 = MessageSentEvent[1].args._nodeData;

      let nodes: string[] = [];

      const nonce2 = "0x" + msg2.slice(2, 18);
      const to2 = "0x" + msg2.slice(18, 58); //18+40
      const from2 = "0x" + msg2.slice(58, 98); //58+40
      const msgData2 = "0x" + msg2.slice(98);

      nodes.push(MerkleTree.makeLeafNode(nonce, to, from, msgData));
      nodes.push(MerkleTree.makeLeafNode(nonce2, to2, from2, msgData2));

      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / Number(await veaInbox.epochPeriod())
      );
      const batchMerkleRoot = await veaInbox.snapshots(epoch);
      // Honest Bridger
      await claimAndVerify({
        veaInbox,
        veaOutbox,
        bridger,
        epoch,
        batchMerkleRoot,
        ethers,
        network,
        mine,
      });
      const mt = new MerkleTree(nodes);
      await expect(veaOutbox.connect(relayer).sendMessage([], nonce, to, from, msgData)).to.be.revertedWith(
        "Invalid proof."
      );
      const proof = mt.getHexProof(nodes[0]);

      const verifyAndRelayTx = await veaOutbox.connect(relayer).sendMessage(proof, nonce, to, from, msgData);
      await expect(verifyAndRelayTx).to.emit(veaOutbox, "MessageRelayed").withArgs(0);

      await expect(veaOutbox.connect(relayer).sendMessage(proof, nonce, to, from, msgData)).to.be.revertedWith(
        "Message already relayed"
      );
    });

    it("should be able to verify and relay with global allowance", async () => {
      // Disabling the allowlist for the sender enable in beforeEach hook (default is false)
      await receiverGateway.allowlistSender(false);
      await receiverGateway.allowlistAllSender(true);
      // sending sample data through the fast bridge
      const data = 1121;
      const sendMessagetx = await senderGateway.sendMessage(data);

      await senderGateway.sendMessage(data);
      await expect(sendMessagetx).to.emit(veaInbox, "MessageSent");
      const MessageSent = veaInbox.filters.MessageSent();
      const MessageSentEvent = await veaInbox.queryFilter(MessageSent);
      const msg = MessageSentEvent[0].args._nodeData;

      const { nonce, to, from, msgData } = decodeMessage(msg);

      const msg2 = MessageSentEvent[1].args._nodeData;

      let nodes: string[] = [];

      const nonce2 = "0x" + msg2.slice(2, 18);
      const to2 = "0x" + msg2.slice(18, 58); //18+40
      const from2 = "0x" + msg2.slice(58, 98); //58+40
      const msgData2 = "0x" + msg2.slice(98);

      nodes.push(MerkleTree.makeLeafNode(nonce, to, from, msgData));
      nodes.push(MerkleTree.makeLeafNode(nonce2, to2, from2, msgData2));

      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / Number(await veaInbox.epochPeriod())
      );
      const batchMerkleRoot = await veaInbox.snapshots(epoch);
      // Honest Bridger
      await claimAndVerify({
        veaInbox,
        veaOutbox,
        bridger,
        epoch,
        batchMerkleRoot,
        ethers,
        network,
        mine,
      });
      const mt = new MerkleTree(nodes);
      await expect(veaOutbox.connect(relayer).sendMessage([], nonce, to, from, msgData)).to.be.revertedWith(
        "Invalid proof."
      );
      const proof = mt.getHexProof(nodes[0]);

      const verifyAndRelayTx = await veaOutbox.connect(relayer).sendMessage(proof, nonce, to, from, msgData);
      await expect(verifyAndRelayTx).to.emit(veaOutbox, "MessageRelayed").withArgs(0);
    });

    it("should allow bridger to claim deposit", async () => {
      // sending sample data through the fast bridge
      const data = 1121;
      const sendMessagetx = await senderGateway.sendMessage(data);

      await expect(sendMessagetx).to.emit(veaInbox, "MessageSent");
      const MessageSent = veaInbox.filters.MessageSent();
      const MessageSentEvent = await veaInbox.queryFilter(MessageSent);
      const msg = MessageSentEvent[0].args._nodeData;
      const { nonce, to, from, msgData } = decodeMessage(msg);

      let nodes: string[] = [];
      nodes.push(MerkleTree.makeLeafNode(nonce, to, from, msgData));

      const mt = new MerkleTree(nodes);
      const proof = mt.getHexProof(nodes[nodes.length - 1]);

      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / Number(await veaInbox.epochPeriod())
      );
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      const epochPeriod = Number(await veaInbox.epochPeriod());

      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");

      // Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const blockClaim = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);
      if (!blockClaim) return;
      const maxL2StateSyncDelay = Number(await veaOutbox.sequencerDelayLimit()) + epochPeriod / 2;
      await network.provider.send("evm_increaseTime", [epochPeriod + maxL2StateSyncDelay]);
      await network.provider.send("evm_mine");

      const startValidationTxn = await veaOutbox.startVerification(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: blockClaim.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.ZeroAddress,
      });
      await expect(startValidationTxn).to.emit(veaOutbox, "VerificationStarted").withArgs(epoch);

      const blockStartValidation = await ethers.provider.getBlock(startValidationTxn.blockNumber!);
      if (!blockStartValidation) return;

      const minChallengePeriod = Number(await veaOutbox.minChallengePeriod());
      await network.provider.send("evm_increaseTime", [minChallengePeriod]);
      await network.provider.send("evm_mine");
      const blocksToMine = Math.ceil(minChallengePeriod / 12);
      await mine(blocksToMine);

      await veaOutbox.connect(bridger).verifySnapshot(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: blockClaim.timestamp,
        timestampVerification: blockStartValidation.timestamp!,
        blocknumberVerification: startValidationTxn.blockNumber!,
        honest: 0,
        challenger: ethers.ZeroAddress,
      });

      const verifyAndRelayTx = await veaOutbox.connect(relayer).sendMessage(proof, 0, to, from, msgData);
      await expect(verifyAndRelayTx).to.emit(veaOutbox, "MessageRelayed").withArgs(0);

      await veaOutbox.connect(bridger).withdrawClaimDeposit(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: blockClaim.timestamp,
        timestampVerification: blockStartValidation.timestamp!,
        blocknumberVerification: startValidationTxn.blockNumber!,
        honest: 1,
        challenger: ethers.ZeroAddress,
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
      const { nonce, to, from, msgData } = decodeMessage(msg);

      let nodes: string[] = [];
      nodes.push(MerkleTree.makeLeafNode(nonce, to, from, msgData));

      const mt = new MerkleTree(nodes);
      const proof = mt.getHexProof(nodes[nodes.length - 1]);

      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / Number(await veaInbox.epochPeriod())
      );
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      const epochPeriod = Number(await veaInbox.epochPeriod());

      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");

      // Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const blockClaim = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);
      if (!blockClaim) return;

      const maxL2StateSyncDelay = Number(await veaOutbox.sequencerDelayLimit()) + epochPeriod / 2;
      await network.provider.send("evm_increaseTime", [epochPeriod + maxL2StateSyncDelay]);
      await network.provider.send("evm_mine");

      const startValidationTxn = await veaOutbox.startVerification(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: blockClaim.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.ZeroAddress,
      });
      await expect(startValidationTxn).to.emit(veaOutbox, "VerificationStarted").withArgs(epoch);

      const blockStartValidation = await ethers.provider.getBlock(startValidationTxn.blockNumber!);
      if (!blockStartValidation) return;

      const minChallengePeriod = Number(await veaOutbox.minChallengePeriod());
      await network.provider.send("evm_increaseTime", [minChallengePeriod]);
      await network.provider.send("evm_mine");
      const blocksToMine = Math.ceil(minChallengePeriod / 12);
      await mine(blocksToMine);

      await veaOutbox.connect(bridger).verifySnapshot(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: blockClaim.timestamp,
        timestampVerification: blockStartValidation.timestamp!,
        blocknumberVerification: startValidationTxn.blockNumber!,
        honest: 0,
        challenger: ethers.ZeroAddress,
      });

      const verifyAndRelayTx = await veaOutbox.connect(relayer).sendMessage(proof, 0, to, from, msgData);
      await expect(verifyAndRelayTx).to.emit(veaOutbox, "MessageRelayed").withArgs(0);

      await veaOutbox.withdrawClaimDeposit(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: blockClaim.timestamp,
        timestampVerification: blockStartValidation.timestamp!,
        blocknumberVerification: startValidationTxn.blockNumber!,
        honest: 1,
        challenger: ethers.ZeroAddress,
      });
    });
  });

  describe("Honest Claim - Dishonest Challenge - Bridger paid, challenger deposit forfeited", async () => {
    // most of the functions are tested thoroughly in the above test case
    // only challenge related functionality are tested here

    it("should be able to challenge", async () => {
      const data = 1121;
      await senderGateway.sendMessage(data);
      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epochPeriod = Number(await veaInbox.epochPeriod());
      const epoch = Math.floor((await batchOutGoingEvent[0].getBlock()).timestamp / epochPeriod);
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");

      // bridger tx starts - Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);
      if (!block) return;

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
            challenger: ethers.ZeroAddress,
          },
          { value: TEN_ETH }
        );

      await expect(challengeTx).to.emit(veaOutbox, "Challenged").withArgs(epoch, challenger.address);
    });

    it("should be able to fallback to send safe", async () => {
      const data = 1121;

      await senderGateway.sendMessage(data);
      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epochPeriod = Number(await veaInbox.epochPeriod());
      const epoch = Math.floor((await batchOutGoingEvent[0].getBlock()).timestamp / epochPeriod);
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");

      // bridger tx starts - Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);
      if (!block) return;

      await veaOutbox.connect(challenger)["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](
        epoch,
        {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestampClaimed: block.timestamp,
          timestampVerification: 0,
          blocknumberVerification: 0,
          honest: 0,
          challenger: ethers.ZeroAddress,
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
        .withArgs(epoch, ethers.encodeBytes32String("")); // ticketId is always 0x00..0
    });

    it("challenger's deposit should be forfeited", async () => {
      // sample data
      const data = 1121;

      const sendMessagetx = await senderGateway.sendMessage(data);
      await expect(sendMessagetx).to.emit(veaInbox, "MessageSent");
      const MessageSent = veaInbox.filters.MessageSent();
      const MessageSentEvent = await veaInbox.queryFilter(MessageSent);
      const msg = MessageSentEvent[0].args._nodeData;
      const { nonce, to, from, msgData } = decodeMessage(msg);

      let nodes: string[] = [];
      nodes.push(MerkleTree.makeLeafNode(nonce, to, from, msgData));

      const mt = new MerkleTree(nodes);
      const proof = mt.getHexProof(nodes[nodes.length - 1]);

      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epochPeriod = Number(await veaInbox.epochPeriod());
      const epoch = Math.floor((await batchOutGoingEvent[0].getBlock()).timestamp / epochPeriod);
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");

      // bridger tx starts - Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);
      if (!block) return;
      // withdraw challenge deposit should revert for invalid epoch
      await expect(
        veaOutbox.connect(challenger).withdrawChallengeDeposit(epoch, {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestampClaimed: block.timestamp,
          timestampVerification: 0,
          blocknumberVerification: 0,
          honest: 0,
          challenger: ethers.ZeroAddress,
        })
      ).to.be.revertedWith("Challenge failed.");

      const maxL2StateSyncDelay = Number(await veaOutbox.sequencerDelayLimit()) + epochPeriod / 2;
      await network.provider.send("evm_increaseTime", [epochPeriod + maxL2StateSyncDelay]);
      await network.provider.send("evm_mine");

      const startValidationTxn = await veaOutbox.startVerification(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: block.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.ZeroAddress,
      });
      await expect(startValidationTxn).to.emit(veaOutbox, "VerificationStarted").withArgs(epoch);

      const blockStartValidation = await ethers.provider.getBlock(startValidationTxn.blockNumber!);
      if (!blockStartValidation) return;

      const minChallengePeriod = Number(await veaOutbox.minChallengePeriod());
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
            challenger: ethers.ZeroAddress,
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

      await veaInbox.connect(bridger).sendSnapshot(
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

      const verifyAndRelayTx = await veaOutbox.connect(relayer).sendMessage(proof, 0, to, from, msgData);
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

      await veaOutbox.withdrawClaimDeposit(epoch, {
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
      const { nonce, to, from, msgData } = decodeMessage(msg);

      let nodes: string[] = [];
      nodes.push(MerkleTree.makeLeafNode(nonce, to, from, msgData));

      const mt = new MerkleTree(nodes);
      const proof = mt.getHexProof(nodes[nodes.length - 1]);

      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / Number(await veaInbox.epochPeriod())
      );
      const epochPeriod = Number(await veaOutbox.epochPeriod());

      const batchMerkleRoot = await veaInbox.snapshots(epoch);
      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");
      // bridger tx starts - bridger creates fakeData & fakeHash

      const fakeData = "KlerosToTheMoon";
      const fakeHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string"], [fakeData]));
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, fakeHash, { value: TEN_ETH });
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);
      if (!block) return;

      const maxL2StateSyncDelay = Number(await veaOutbox.sequencerDelayLimit()) + epochPeriod / 2;
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
        challenger: ethers.ZeroAddress,
      });
      await expect(startValidationTxn).to.emit(veaOutbox, "VerificationStarted").withArgs(epoch);
      const blockStartValidation = await ethers.provider.getBlock(startValidationTxn.blockNumber!);
      if (!blockStartValidation) return;

      const minChallengePeriod = Number(await veaOutbox.minChallengePeriod());
      await network.provider.send("evm_increaseTime", [minChallengePeriod]);
      await network.provider.send("evm_mine");
      const blocksToMine = Math.ceil(minChallengePeriod / 12);
      await mine(blocksToMine);

      // Challenger tx starts
      await veaOutbox.connect(challenger)["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](
        epoch,
        {
          stateRoot: fakeHash,
          claimer: bridger.address,
          timestampClaimed: block.timestamp,
          timestampVerification: blockStartValidation.timestamp!,
          blocknumberVerification: startValidationTxn.blockNumber!,
          honest: 0,
          challenger: ethers.ZeroAddress,
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
      await veaInbox.connect(bridger).sendSnapshot(
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
      const verifyAndRelayTx = await veaOutbox.connect(relayer).sendMessage(proof, 0, to, from, msgData);
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
      const { nonce, to, from, msgData } = decodeMessage(msg);

      let nodes: string[] = [];
      nodes.push(MerkleTree.makeLeafNode(nonce, to, from, msgData));

      const mt = new MerkleTree(nodes);
      const proof = mt.getHexProof(nodes[nodes.length - 1]);

      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / Number(await veaInbox.epochPeriod())
      );
      const epochPeriod = Number(await veaOutbox.epochPeriod());

      const batchMerkleRoot = await veaInbox.snapshots(epoch);
      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");
      // bridger tx starts - bridger creates fakeData & fakeHash

      const fakeData = "KlerosToTheMoon";
      const fakeHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string"], [fakeData]));
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, fakeHash, { value: TEN_ETH });
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);
      if (!block) return;

      const maxL2StateSyncDelay = Number(await veaOutbox.sequencerDelayLimit()) + epochPeriod / 2;
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
        challenger: ethers.ZeroAddress,
      });
      await expect(startValidationTxn).to.emit(veaOutbox, "VerificationStarted").withArgs(epoch);
      const blockStartValidation = await ethers.provider.getBlock(startValidationTxn.blockNumber!);
      if (!blockStartValidation) return;

      const minChallengePeriod = Number(await veaOutbox.minChallengePeriod());
      await network.provider.send("evm_increaseTime", [minChallengePeriod]);
      await network.provider.send("evm_mine");
      const blocksToMine = Math.ceil(minChallengePeriod / 12);
      await mine(blocksToMine);

      // Challenger tx starts
      await veaOutbox.connect(challenger)["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](
        epoch,
        {
          stateRoot: fakeHash,
          claimer: bridger.address,
          timestampClaimed: block.timestamp,
          timestampVerification: blockStartValidation.timestamp!,
          blocknumberVerification: startValidationTxn.blockNumber!,
          honest: 0,
          challenger: ethers.ZeroAddress,
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
      await veaInbox.connect(bridger).sendSnapshot(
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
      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / Number(await veaInbox.epochPeriod())
      );
      const stateRoot1 = await veaInbox.snapshots(epoch);
      const epochPeriod = Number(await veaOutbox.epochPeriod());
      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");

      // bridger tx starts - bridger creates fakeData & fakeHash
      const fakeData = "KlerosToTheMoon";
      const fakeHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string"], [fakeData]));
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, fakeHash, { value: TEN_ETH });
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);
      if (!block) return;

      const maxL2StateSyncDelay = Number(await veaOutbox.sequencerDelayLimit()) + epochPeriod / 2;
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
        challenger: ethers.ZeroAddress,
      });
      await expect(startValidationTxn).to.emit(veaOutbox, "VerificationStarted").withArgs(epoch);

      const blockStartValidation = await ethers.provider.getBlock(startValidationTxn.blockNumber!);
      if (!blockStartValidation) return;
      const minChallengePeriod = Number(await veaOutbox.minChallengePeriod());

      await network.provider.send("evm_increaseTime", [minChallengePeriod]);
      await network.provider.send("evm_mine");
      const blocksToMine = Math.ceil(minChallengePeriod / 12);
      await mine(blocksToMine);

      // Challenger tx starts
      await veaOutbox.connect(challenger)["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](
        epoch,
        {
          stateRoot: fakeHash,
          claimer: bridger.address,
          timestampClaimed: block.timestamp,
          timestampVerification: blockStartValidation.timestamp!,
          blocknumberVerification: startValidationTxn.blockNumber!,
          honest: 0,
          challenger: ethers.ZeroAddress,
        },
        { value: TEN_ETH }
      );

      // 2nd message at new epoch
      const epoch2 = await veaOutbox.epochNow();

      await network.provider.send("evm_increaseTime", [epochPeriod]);
      await network.provider.send("evm_mine");

      const stateRoot2 = ethers.keccak256(ethers.keccak256(ethers.toUtf8Bytes("stateRoot2")));
      const claimTxn2 = await veaOutbox.connect(bridger).claim(epoch2, stateRoot2, { value: TEN_ETH });
      const claimTxn2Block = await ethers.provider.getBlock(claimTxn2.blockNumber!);
      if (!claimTxn2Block) return;
      await network.provider.send("evm_increaseTime", [maxL2StateSyncDelay + epochPeriod]);
      await network.provider.send("evm_mine");

      const startValidationTxn2 = await veaOutbox.startVerification(epoch2, {
        stateRoot: stateRoot2,
        claimer: bridger.address,
        timestampClaimed: claimTxn2Block.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: ethers.ZeroAddress,
      });

      const blockStartValidation2 = await ethers.provider.getBlock(startValidationTxn2.blockNumber!);
      if (!blockStartValidation2) return;
      await network.provider.send("evm_increaseTime", [minChallengePeriod]);
      await network.provider.send("evm_mine");
      await mine(blocksToMine);

      await veaOutbox.connect(bridger).verifySnapshot(epoch2, {
        stateRoot: stateRoot2,
        claimer: bridger.address,
        timestampClaimed: claimTxn2Block.timestamp,
        timestampVerification: blockStartValidation2.timestamp!,
        blocknumberVerification: startValidationTxn2.blockNumber!,
        honest: 0,
        challenger: ethers.ZeroAddress,
      });

      // Resolve dispute
      await veaInbox.connect(bridger).sendSnapshot(
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

// Utility function for claiming and verifying a batch
async function claimAndVerify({
  veaInbox,
  veaOutbox,
  bridger,
  epoch,
  batchMerkleRoot,
  ethers,
  network,
  mine,
}: {
  veaInbox: any;
  veaOutbox: any;
  bridger: any;
  epoch: number;
  batchMerkleRoot: string;
  ethers: any;
  network: any;
  mine: (blocks: number) => Promise<void>;
}) {
  const epochPeriod = Number(await veaInbox.epochPeriod());

  await network.provider.send("evm_increaseTime", [epochPeriod]);
  await network.provider.send("evm_mine");

  // Honest Bridger
  const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
  const blockClaim = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);
  if (!blockClaim) return;
  const maxL2StateSyncDelay = Number(await veaOutbox.sequencerDelayLimit()) + epochPeriod / 2;
  await network.provider.send("evm_increaseTime", [epochPeriod + maxL2StateSyncDelay]);
  await network.provider.send("evm_mine");

  const startValidationTxn = await veaOutbox.startVerification(epoch, {
    stateRoot: batchMerkleRoot,
    claimer: bridger.address,
    timestampClaimed: blockClaim.timestamp,
    timestampVerification: 0,
    blocknumberVerification: 0,
    honest: 0,
    challenger: ethers.ZeroAddress,
  });
  await expect(startValidationTxn).to.emit(veaOutbox, "VerificationStarted").withArgs(epoch);

  const blockStartValidation = await ethers.provider.getBlock(startValidationTxn.blockNumber!);
  if (!blockStartValidation) return;

  const minChallengePeriod = Number(await veaOutbox.minChallengePeriod());
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
    challenger: ethers.ZeroAddress,
  });
}

function decodeMessage(msg: any) {
  const nonce = "0x" + msg.slice(2, 18);
  const to = "0x" + msg.slice(18, 58); //18+40
  const from = "0x" + msg.slice(58, 98); //58+40
  const msgData = "0x" + msg.slice(98);
  return { nonce, to, from, msgData };
}

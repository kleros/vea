import { expect } from "chai";
import { deployments, ethers, getNamedAccounts, network } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { BigNumber, utils } from "ethers";
import "@nomiclabs/hardhat-ethers";

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
const EPOCH_PERIOD = 1800;
const CHALLENGE_PERIOD = 1800;

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
    expect(await veaInbox.veaOutbox()).to.equal(veaOutbox.address);

    // veaOutbox
    expect(await veaOutbox.deposit()).to.equal(TEN_ETH);
    expect(await veaOutbox.epochPeriod()).to.equal(EPOCH_PERIOD);
    expect(await veaOutbox.challengePeriod()).to.equal(CHALLENGE_PERIOD);
    expect(await veaOutbox.veaInbox()).to.equal(veaInbox.address);
    expect(await veaOutbox.bridge()).to.equal(bridge.address);

    // ReceiverGateway
    expect(await receiverGateway.veaOutbox()).to.equal(veaOutbox.address);
    expect(await receiverGateway.senderGateway()).to.equal(senderGateway.address);
  });

  describe("Honest Claim - No Challenge - Bridger Paid", async () => {
    it("should send the fastMessage", async () => {
      // sending sample data through the fast Bridge
      const data = 1121;
      const sendMessageTx = await senderGateway.sendMessage(data);
      const sendMessageTx2 = await senderGateway.sendMessage(data);
      const sendMessageTx3 = await senderGateway.sendMessage(data);
      const sendMessageTx4 = await senderGateway.sendMessage(data);
      const sendMessageTx5 = await senderGateway.sendMessage(data);
      const sendMessageTx6 = await senderGateway.sendMessage(data);
      const sendMessageTx7 = await senderGateway.sendMessage(data);
      await veaInbox.connect(bridger).saveSnapshot();
    });

    it("should send the batch", async () => {
      // should revert if No messages have been sent yet.

      const data = 1121;
      let sendMessageTx = await senderGateway.sendMessage(data);

      const currentBlockNum = ethers.provider.getBlockNumber();
      const currentTimestamp = (await ethers.provider.getBlock(currentBlockNum)).timestamp;
      const currentEpoch = Math.floor(currentTimestamp / EPOCH_PERIOD);

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
      const sendMessagetx = await senderGateway.sendMessage(data);

      const sendBatchTx = await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / (await veaInbox.epochPeriod()).toNumber()
      );
      const batchMerkleRoot = await veaInbox.snapshots(epoch);
      const invalidEpoch = BigNumber.from(2).add(epoch);

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

      await expect(bridgerClaimTx).to.emit(veaOutbox, "Claimed").withArgs(bridger.address, batchMerkleRoot);

      await expect(veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH })).to.be.revertedWith(
        "Claim already made."
      ); // should fail with this revert message.
    });

    it("should be able to verify batch", async () => {
      // should fail for invalid epochs

      await expect(
        veaOutbox.connect(bridger).validateSnapshot(0, {
          stateRoot: ethers.constants.HashZero,
          claimer: bridger.address,
          timestamp: 0,
          blocknumber: 0,
          honest: 0,
          challenger: challenger.address,
        })
      ).to.be.revertedWith("Invalid claim.");

      // sending sample data through the fast bridge
      const data = 1121;
      const sendMessagetx = await senderGateway.sendMessage(data);

      const sendBatchTx = await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / (await veaInbox.epochPeriod()).toNumber()
      );
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      // Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const blockClaim = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);

      // should revert as the challenge period has not passed
      await expect(
        veaOutbox.connect(bridger).validateSnapshot(epoch, {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestamp: blockClaim.timestamp,
          blocknumber: bridgerClaimTx.blockNumber!,
          honest: 0,
          challenger: ethers.constants.AddressZero,
        })
      ).to.be.revertedWith("Challenge period has not yet elapsed.");

      // wait for challenge period (and epoch) to pass
      console.log("block number");
      console.log(bridgerClaimTx.blockNumber);
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);
      await network.provider.send("evm_increaseTime", [1800]);
      await network.provider.send("evm_mine");

      const bridgerVerifyBatchTx = await veaOutbox.connect(bridger).validateSnapshot(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestamp: block.timestamp,
        blocknumber: bridgerClaimTx.blockNumber!,
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
      const msg = MessageSentEvent[0].args.nodeData;

      const nonce = "0x" + msg.slice(2, 18);
      const to = "0x" + msg.slice(18, 58); //18+40
      const msgData = "0x" + msg.slice(58);

      const msg2 = MessageSentEvent[1].args.nodeData;

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
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);

      // wait for challenge period (and epoch) to pass
      await network.provider.send("evm_increaseTime", [1800]);
      await network.provider.send("evm_mine");

      const bridgerVerifyBatchTx = await veaOutbox.connect(bridger).validateSnapshot(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestamp: block.timestamp,
        blocknumber: bridgerClaimTx.blockNumber!,
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
      const msg = MessageSentEvent[0].args.nodeData;
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

      // Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);

      // wait for challenge period (and epoch) to pass
      await network.provider.send("evm_increaseTime", [1800]);
      await network.provider.send("evm_mine");

      const bridgerVerifyBatchTx = await veaOutbox.connect(bridger).validateSnapshot(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestamp: block.timestamp,
        blocknumber: bridgerClaimTx.blockNumber!,
        honest: 0,
        challenger: ethers.constants.AddressZero,
      });

      const verifyAndRelayTx = await veaOutbox.connect(relayer).sendMessage(proof, 0, to, msgData);
      await expect(verifyAndRelayTx).to.emit(veaOutbox, "MessageRelayed").withArgs(0);

      const withdrawClaimDepositTx = await veaOutbox.connect(bridger).withdrawClaimDeposit(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestamp: block.timestamp,
        blocknumber: bridgerClaimTx.blockNumber!,
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
      const msg = MessageSentEvent[0].args.nodeData;
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

      // Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);

      // wait for challenge period (and epoch) to pass
      await network.provider.send("evm_increaseTime", [1800]);
      await network.provider.send("evm_mine");

      const bridgerVerifyBatchTx = await veaOutbox.connect(bridger).validateSnapshot(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestamp: block.timestamp,
        blocknumber: bridgerClaimTx.blockNumber!,
        honest: 0,
        challenger: ethers.constants.AddressZero,
      });

      const verifyAndRelayTx = await veaOutbox.connect(relayer).sendMessage(proof, 0, to, msgData);
      await expect(verifyAndRelayTx).to.emit(veaOutbox, "MessageRelayed").withArgs(0);

      const withdrawClaimDepositTx = await veaOutbox.withdrawClaimDeposit(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestamp: block.timestamp,
        blocknumber: bridgerClaimTx.blockNumber!,
        honest: 1,
        challenger: ethers.constants.AddressZero,
      });
    });
  });

  describe("Honest Claim - Dishonest Challenge - Bridger paid, challenger deposit forfeited", async () => {
    // most of the functions are tested thoroughly in the above test case
    // only challenge related functionality are tested here

    it("should not be able to challenge after challenge period elapsed", async () => {
      const data = 1121;

      const sendMessagetx = await senderGateway.sendMessage(data);
      const sendBatchTx = await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / (await veaInbox.epochPeriod()).toNumber()
      );
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      // bridger tx starts - Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });

      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);

      // should revert if deposit is less than claim deposit
      // @note - if challenger deposits more than deposit then only the deposit will be returned
      await expect(
        veaOutbox.connect(challenger).challenge(
          epoch,
          {
            stateRoot: batchMerkleRoot,
            claimer: bridger.address,
            timestamp: block.timestamp,
            blocknumber: bridgerClaimTx.blockNumber!,
            honest: 0,
            challenger: ethers.constants.AddressZero,
          },
          { value: ONE_HUNDREDTH_ETH }
        )
      ).to.be.revertedWith("Insufficient challenge deposit.");

      // wait for challenge period (and epoch) to pass
      await network.provider.send("evm_increaseTime", [1800]);
      await network.provider.send("evm_mine");

      await expect(
        veaOutbox.connect(challenger).challenge(
          epoch,
          {
            stateRoot: batchMerkleRoot,
            claimer: bridger.address,
            timestamp: block.timestamp,
            blocknumber: bridgerClaimTx.blockNumber!,
            honest: 0,
            challenger: ethers.constants.AddressZero,
          },
          { value: TEN_ETH }
        )
      ).to.be.revertedWith("Challenge period elapsed.");
    });

    it("should be able to challenge", async () => {
      const data = 1121;

      const sendMessagetx = await senderGateway.sendMessage(data);
      const sendBatchTx = await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / (await veaInbox.epochPeriod()).toNumber()
      );
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      // bridger tx starts - Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);

      const challengeTx = await veaOutbox.connect(challenger).challenge(
        epoch,
        {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestamp: block.timestamp,
          blocknumber: bridgerClaimTx.blockNumber!,
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
      const epoch = Math.floor(
        (await batchOutGoingEvent[0].getBlock()).timestamp / (await veaInbox.epochPeriod()).toNumber()
      );
      const batchMerkleRoot = await veaInbox.snapshots(epoch);
      // bridger tx starts - Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);

      const challengeTx = await veaOutbox.connect(challenger).challenge(
        epoch,
        {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestamp: block.timestamp,
          blocknumber: bridgerClaimTx.blockNumber!,
          honest: 0,
          challenger: ethers.constants.AddressZero,
        },
        { value: TEN_ETH }
      );

      // wait for challenge period (and epoch) to pass
      await network.provider.send("evm_increaseTime", [1800]);
      await network.provider.send("evm_mine");

      await expect(
        veaOutbox.connect(relayer).validateSnapshot(epoch, {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestamp: block.timestamp,
          blocknumber: bridgerClaimTx.blockNumber!,
          honest: 0,
          challenger: challenger.address,
        })
      ).to.be.revertedWith("Claim is challenged.");

      const sendSafeFallbackTx = await veaInbox.connect(bridger).sendSnapshot(
        epoch,
        {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestamp: block.timestamp,
          blocknumber: bridgerClaimTx.blockNumber!,
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
      const msg = MessageSentEvent[0].args.nodeData;
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

      // bridger tx starts - Honest Bridger
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot, { value: TEN_ETH });
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);

      // withdraw challenge deposit should revert for invalid epoch
      await expect(
        veaOutbox.connect(challenger).withdrawChallengeDeposit(epoch, {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestamp: block.timestamp,
          blocknumber: bridgerClaimTx.blockNumber!,
          honest: 0,
          challenger: ethers.constants.AddressZero,
        })
      ).to.be.revertedWith("Challenge failed.");

      // Challenger tx starts
      const challengeTx = await veaOutbox.connect(challenger).challenge(
        epoch,
        {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestamp: block.timestamp,
          blocknumber: bridgerClaimTx.blockNumber!,
          honest: 0,
          challenger: ethers.constants.AddressZero,
        },
        { value: TEN_ETH }
      );
      await expect(challengeTx).to.emit(veaOutbox, "Challenged").withArgs(epoch, challenger.address);
      // wait for challenge period (and epoch) to pass
      await network.provider.send("evm_increaseTime", [1800]);
      await network.provider.send("evm_mine");

      await expect(
        veaOutbox.connect(relayer).validateSnapshot(epoch, {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestamp: block.timestamp,
          blocknumber: bridgerClaimTx.blockNumber!,
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
          timestamp: block.timestamp,
          blocknumber: bridgerClaimTx.blockNumber!,
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
          timestamp: block.timestamp,
          blocknumber: bridgerClaimTx.blockNumber!,
          honest: 1,
          challenger: challenger.address,
        })
      ).to.be.revertedWith("Challenge failed.");

      const withdrawClaimDepositTx = await veaOutbox.withdrawClaimDeposit(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestamp: block.timestamp,
        blocknumber: bridgerClaimTx.blockNumber!,
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
      const msg = MessageSentEvent[0].args.nodeData;
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

      // bridger tx starts - bridger creates fakeData & fakeHash

      const fakeData = "KlerosToTheMoon";
      const fakeHash = utils.keccak256(utils.defaultAbiCoder.encode(["string"], [fakeData]));
      const bridgerClaimTx = await veaOutbox.connect(bridger).claim(epoch, fakeHash, { value: TEN_ETH });
      const block = await ethers.provider.getBlock(bridgerClaimTx.blockNumber!);

      // Challenger tx starts
      const challengeTx = await veaOutbox.connect(challenger).challenge(
        epoch,
        {
          stateRoot: fakeHash,
          claimer: bridger.address,
          timestamp: block.timestamp,
          blocknumber: bridgerClaimTx.blockNumber!,
          honest: 0,
          challenger: ethers.constants.AddressZero,
        },
        { value: TEN_ETH }
      );

      // wait for challenge period (and epoch) to pass
      await network.provider.send("evm_increaseTime", [1800]);
      await network.provider.send("evm_mine");

      await expect(
        veaOutbox.connect(relayer).validateSnapshot(epoch, {
          stateRoot: fakeHash,
          claimer: bridger.address,
          timestamp: block.timestamp,
          blocknumber: bridgerClaimTx.blockNumber!,
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
          timestamp: block.timestamp,
          blocknumber: bridgerClaimTx.blockNumber!,
          honest: 0,
          challenger: challenger.address,
        },
        { gasLimit: 1000000 }
      );
      const verifyAndRelayTx = await veaOutbox.connect(relayer).sendMessage(proof, 0, to, msgData);
      await expect(verifyAndRelayTx).to.emit(veaOutbox, "MessageRelayed").withArgs(0);
      expect(
        veaOutbox.connect(relayer).withdrawClaimDeposit(epoch, {
          stateRoot: fakeHash,
          claimer: bridger.address,
          timestamp: block.timestamp,
          blocknumber: bridgerClaimTx.blockNumber!,
          honest: 0,
          challenger: challenger.address,
        })
      ).to.be.revertedWith("Claim failed.");

      await expect(
        veaOutbox.connect(relayer).withdrawChallengeDeposit(epoch, {
          stateRoot: fakeHash,
          claimer: bridger.address,
          timestamp: block.timestamp,
          blocknumber: bridgerClaimTx.blockNumber!,
          honest: 2,
          challenger: challenger.address,
        })
      );
    });
  });
});

import { expect } from "chai";
import { deployments, ethers, network } from "hardhat";
import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MerkleTree } from "../merkle/MerkleTree";
const { mine } = require("@nomicfoundation/hardhat-network-helpers");

import {
  VeaOutboxArbToGnosis,
  ReceiverGatewayMock,
  VeaInboxArbToGnosis,
  SenderGatewayMock,
  RouterArbToGnosis,
  MockWETH,
  MockAMB,
  ArbSysMock,
} from "../../typechain-types";

// Constants
const TEN_ETH = BigNumber.from(10).pow(19);
const EPOCH_PERIOD = 600;
const CHALLENGE_PERIOD = 600;
const SEQUENCER_DELAY = 300;

describe("Arbitrum to Gnosis Bridge Tests", async () => {
  // Test participants
  let bridger: SignerWithAddress;
  let sender: SignerWithAddress;
  let receiver: SignerWithAddress;
  let challenger: SignerWithAddress;

  // Contracts
  let veaOutbox: VeaOutboxArbToGnosis;
  let receiverGateway: ReceiverGatewayMock;
  let veaInbox: VeaInboxArbToGnosis;
  let senderGateway: SenderGatewayMock;
  let router: RouterArbToGnosis;
  let amb: MockAMB;
  let weth: MockWETH;
  let arbsysMock: ArbSysMock;

  // Helper function to create a claim object
  const createClaim = (stateRoot: string, claimer: string, timestamp: number) => ({
    stateRoot,
    claimer,
    timestampClaimed: timestamp,
    timestampVerification: 0,
    blocknumberVerification: 0,
    honest: 0,
    challenger: ethers.constants.AddressZero,
  });

  // Helper function to simulate dispute resolution
  async function simulateDisputeResolution(epoch: number, claim: any) {
    await veaInbox.connect(bridger).sendSnapshot(epoch, 100000, claim, { gasLimit: 100000 });

    await network.provider.send("evm_increaseTime", [CHALLENGE_PERIOD + SEQUENCER_DELAY]);
    await network.provider.send("evm_mine");

    const events = await amb.queryFilter(amb.filters.MockedEvent());
    const lastEvent = events[events.length - 1];

    await amb.executeMessageCall(
      veaOutbox.address,
      router.address,
      lastEvent.args._data,
      lastEvent.args.messageId,
      1000000
    );
  }

  // Helper function to setup a claim and challenge
  async function setupClaimAndChallenge(epoch: any, merkleRoot: string, honest: number) {
    const claimTx = await veaOutbox.connect(bridger).claim(epoch, merkleRoot);
    const claimBlock = await ethers.provider.getBlock(claimTx.blockNumber!);

    const challengeTx = await veaOutbox.connect(challenger).challenge(epoch, {
      stateRoot: merkleRoot,
      claimer: bridger.address,
      timestampClaimed: claimBlock.timestamp,
      timestampVerification: 0,
      blocknumberVerification: 0,
      honest,
      challenger: ethers.constants.AddressZero,
    });

    return { claimBlock, merkleRoot, challengeTx };
  }

  before("Initialize wallets", async () => {
    [challenger, bridger, sender, receiver] = await ethers.getSigners();
  });

  beforeEach("Setup contracts and tokens", async () => {
    // Deploy contracts
    await deployments.fixture(["ArbToGnosisOutbox", "ArbToGnosisInbox", "ArbToGnosisRouter"], {
      fallbackToGlobal: true,
      keepExistingDeployments: false,
    });

    // Get contract instances
    veaOutbox = (await ethers.getContract("VeaOutboxArbToGnosis")) as VeaOutboxArbToGnosis;
    receiverGateway = (await ethers.getContract("ArbToGnosisReceiverGateway")) as ReceiverGatewayMock;
    veaInbox = (await ethers.getContract("VeaInboxArbToGnosis")) as VeaInboxArbToGnosis;
    senderGateway = (await ethers.getContract("ArbToGnosisSenderGateway")) as SenderGatewayMock;
    router = (await ethers.getContract("RouterArbToGnosis")) as RouterArbToGnosis;
    amb = (await ethers.getContract("MockAMB")) as MockAMB;
    weth = (await ethers.getContract("MockWETH")) as MockWETH;
    arbsysMock = (await ethers.getContract("ArbSysMock")) as ArbSysMock;

    // Setup initial token balances
    await weth.deposit({ value: TEN_ETH.mul(100) });
    await weth.transfer(bridger.address, TEN_ETH.mul(10));
  });

  describe("Honest Claim - No Challenge - Bridger Paid", async () => {
    it("should send a message and save snapshot", async () => {
      const data = 1121;
      await senderGateway.connect(sender).sendMessage(data);
      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor((await batchOutGoingEvent[0].getBlock()).timestamp / EPOCH_PERIOD);
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      expect(await veaInbox.snapshots(epoch)).to.equal(batchMerkleRoot, "Snapshot not saved correctly");
    });

    it("should allow bridger to claim", async () => {
      // Setup
      const data = 1121;
      await senderGateway.connect(sender).sendMessage(data);
      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor((await batchOutGoingEvent[0].getBlock()).timestamp / EPOCH_PERIOD);
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      // Advance time to next epoch
      await network.provider.send("evm_increaseTime", [EPOCH_PERIOD]);
      await network.provider.send("evm_mine");

      // Approve WETH spending and claim
      await weth.connect(bridger).approve(veaOutbox.address, TEN_ETH.mul(2));
      const claimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot);

      // Check claim event
      await expect(claimTx).to.emit(veaOutbox, "Claimed").withArgs(bridger.address, epoch, batchMerkleRoot);

      // Ensure double claim is not possible
      await expect(veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot)).to.be.revertedWith("Claim already made.");
    });

    it("should start verification after maxL2StateSyncDelay", async () => {
      // Setup
      const data = 1121;
      await senderGateway.connect(sender).sendMessage(data);
      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor((await batchOutGoingEvent[0].getBlock()).timestamp / EPOCH_PERIOD);
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      // Advance time and make claim
      await network.provider.send("evm_increaseTime", [EPOCH_PERIOD]);
      await network.provider.send("evm_mine");

      await weth.connect(bridger).approve(veaOutbox.address, TEN_ETH);
      const claimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot);
      const block = await ethers.provider.getBlock(claimTx.blockNumber!);

      // Calculate and advance time for maxL2StateSyncDelay
      const sequencerDelayLimit = await veaOutbox.sequencerDelayLimit();
      const maxL2StateSyncDelay = sequencerDelayLimit.add(EPOCH_PERIOD);
      await network.provider.send("evm_increaseTime", [maxL2StateSyncDelay.toNumber()]);
      await network.provider.send("evm_mine");

      // Start verification
      const startVerificationTx = await veaOutbox.startVerification(
        epoch,
        createClaim(batchMerkleRoot, bridger.address, block.timestamp)
      );

      await expect(startVerificationTx).to.emit(veaOutbox, "VerificationStarted").withArgs(epoch);
    });

    it("should verify snapshot after challenge period", async () => {
      // Setup
      const data = 1121;
      await senderGateway.connect(sender).sendMessage(data);
      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor((await batchOutGoingEvent[0].getBlock()).timestamp / EPOCH_PERIOD);
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      // Advance time, make claim, and start verification
      await network.provider.send("evm_increaseTime", [EPOCH_PERIOD]);
      await network.provider.send("evm_mine");

      await weth.connect(bridger).approve(veaOutbox.address, TEN_ETH);
      const claimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot);
      const block = await ethers.provider.getBlock(claimTx.blockNumber!);

      const sequencerDelayLimit = await veaOutbox.sequencerDelayLimit();
      const maxL2StateSyncDelay = sequencerDelayLimit.add(EPOCH_PERIOD);

      await network.provider.send("evm_increaseTime", [maxL2StateSyncDelay.toNumber()]);
      await network.provider.send("evm_mine");

      const startVerificationTx = await veaOutbox.startVerification(
        epoch,
        createClaim(batchMerkleRoot, bridger.address, block.timestamp)
      );
      const verificationBlock = await ethers.provider.getBlock(startVerificationTx.blockNumber!);

      // Advance time for challenge period
      const safeAdvanceTime = CHALLENGE_PERIOD + EPOCH_PERIOD;
      await network.provider.send("evm_increaseTime", [safeAdvanceTime]);
      await network.provider.send("evm_mine");

      // Verify snapshot
      await veaOutbox.connect(bridger).verifySnapshot(epoch, {
        ...createClaim(batchMerkleRoot, bridger.address, block.timestamp),
        timestampVerification: verificationBlock.timestamp,
        blocknumberVerification: startVerificationTx.blockNumber!,
      });

      expect(await veaOutbox.stateRoot()).to.equal(batchMerkleRoot, "State root not updated correctly");
      expect(await veaOutbox.latestVerifiedEpoch()).to.equal(epoch, "Latest verified epoch not updated");
    });

    it("should relay message after verification", async () => {
      // Setup
      const data = 1121;
      const sendMessageTx = await senderGateway.connect(sender).sendMessage(data);
      await veaInbox.connect(bridger).saveSnapshot();

      const MessageSent = veaInbox.filters.MessageSent();
      const MessageSentEvent = await veaInbox.queryFilter(MessageSent);
      const msg = MessageSentEvent[0].args._nodeData;
      const nonce = "0x" + msg.slice(2, 18);
      const to = "0x" + msg.slice(18, 58);
      const msgData = "0x" + msg.slice(58);

      let nodes: string[] = [];
      nodes.push(MerkleTree.makeLeafNode(nonce, to, msgData));
      const mt = new MerkleTree(nodes);
      const proof = mt.getHexProof(nodes[0]);

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor((await batchOutGoingEvent[0].getBlock()).timestamp / EPOCH_PERIOD);
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      // Advance time, make claim, and start verification
      await network.provider.send("evm_increaseTime", [EPOCH_PERIOD]);
      await network.provider.send("evm_mine");

      await weth.connect(bridger).approve(veaOutbox.address, TEN_ETH);
      const claimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot);
      const block = await ethers.provider.getBlock(claimTx.blockNumber!);

      const sequencerDelayLimit = await veaOutbox.sequencerDelayLimit();
      const maxL2StateSyncDelay = sequencerDelayLimit.add(EPOCH_PERIOD);

      await network.provider.send("evm_increaseTime", [maxL2StateSyncDelay.toNumber()]);
      await network.provider.send("evm_mine");

      const startVerificationTx = await veaOutbox.startVerification(
        epoch,
        createClaim(batchMerkleRoot, bridger.address, block.timestamp)
      );
      const verificationBlock = await ethers.provider.getBlock(startVerificationTx.blockNumber!);

      await network.provider.send("evm_increaseTime", [CHALLENGE_PERIOD]);
      await mine(Math.ceil(CHALLENGE_PERIOD / 12));

      await veaOutbox.connect(bridger).verifySnapshot(epoch, {
        ...createClaim(batchMerkleRoot, bridger.address, block.timestamp),
        timestampVerification: verificationBlock.timestamp,
        blocknumberVerification: startVerificationTx.blockNumber!,
      });

      // Relay message
      const relayTx = await veaOutbox.connect(receiver).sendMessage(proof, nonce, to, msgData);
      await expect(relayTx).to.emit(veaOutbox, "MessageRelayed").withArgs(0);

      // Ensure message can't be relayed twice
      await expect(veaOutbox.connect(receiver).sendMessage(proof, nonce, to, msgData)).to.be.revertedWith(
        "Message already relayed"
      );
    });

    it("should allow bridger to withdraw deposit after successful claim", async () => {
      // Setup
      const data = 1121;
      await senderGateway.connect(sender).sendMessage(data);
      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      const epoch = Math.floor((await batchOutGoingEvent[0].getBlock()).timestamp / EPOCH_PERIOD);
      const batchMerkleRoot = await veaInbox.snapshots(epoch);

      // Advance time, make claim, and start verification
      await network.provider.send("evm_increaseTime", [EPOCH_PERIOD]);
      await network.provider.send("evm_mine");

      await weth.connect(bridger).approve(veaOutbox.address, TEN_ETH);
      const claimTx = await veaOutbox.connect(bridger).claim(epoch, batchMerkleRoot);
      const block = await ethers.provider.getBlock(claimTx.blockNumber!);

      const sequencerDelayLimit = await veaOutbox.sequencerDelayLimit();
      const maxL2StateSyncDelay = sequencerDelayLimit.add(EPOCH_PERIOD);

      await network.provider.send("evm_increaseTime", [maxL2StateSyncDelay.toNumber()]);
      await network.provider.send("evm_mine");

      const startVerificationTx = await veaOutbox.startVerification(
        epoch,
        createClaim(batchMerkleRoot, bridger.address, block.timestamp)
      );
      const verificationBlock = await ethers.provider.getBlock(startVerificationTx.blockNumber!);

      await network.provider.send("evm_increaseTime", [CHALLENGE_PERIOD]);
      await mine(Math.ceil(CHALLENGE_PERIOD / 12));

      await veaOutbox.connect(bridger).verifySnapshot(epoch, {
        ...createClaim(batchMerkleRoot, bridger.address, block.timestamp),
        timestampVerification: verificationBlock.timestamp,
        blocknumberVerification: startVerificationTx.blockNumber!,
      });

      // Withdraw deposit
      const initialBalance = await weth.balanceOf(bridger.address);
      await veaOutbox.connect(bridger).withdrawClaimDeposit(epoch, {
        ...createClaim(batchMerkleRoot, bridger.address, block.timestamp),
        timestampVerification: verificationBlock.timestamp,
        blocknumberVerification: startVerificationTx.blockNumber!,
        honest: 1,
      });
      const finalBalance = await weth.balanceOf(bridger.address);

      expect(finalBalance.sub(initialBalance)).to.equal(TEN_ETH, "Incorrect withdrawal amount");
    });
  });

  describe("Honest Claim - Dishonest Challenge - Bridger paid, challenger deposit forfeited", async () => {
    let epoch: number;
    let batchMerkleRoot: string;

    beforeEach(async () => {
      // Setup: Send message and save snapshot on Arbitrum
      await senderGateway.connect(sender).sendMessage(1121);
      await veaInbox.connect(bridger).saveSnapshot();

      const BatchOutgoing = veaInbox.filters.SnapshotSaved();
      const batchOutGoingEvent = await veaInbox.queryFilter(BatchOutgoing);
      epoch = Math.floor((await batchOutGoingEvent[0].getBlock()).timestamp / EPOCH_PERIOD);
      batchMerkleRoot = await veaInbox.snapshots(epoch);

      // Advance time to next epoch
      await network.provider.send("evm_increaseTime", [EPOCH_PERIOD]);
      await network.provider.send("evm_mine");

      // Ensure bridger and challenger have enough WETH
      await weth.transfer(bridger.address, TEN_ETH.mul(2));
      await weth.transfer(challenger.address, TEN_ETH.mul(2));

      // Approve WETH spending for both
      await weth.connect(bridger).approve(veaOutbox.address, TEN_ETH.mul(2));
      await weth.connect(challenger).approve(veaOutbox.address, TEN_ETH.mul(2));
      await amb.setMaxGasPerTx(100000);
    });

    it("should allow challenger to submit a challenge", async () => {
      const { claimBlock, challengeTx } = await setupClaimAndChallenge(epoch, batchMerkleRoot, 0);

      await expect(challengeTx).to.emit(veaOutbox, "Challenged").withArgs(epoch, challenger.address);
    });

    it("should handle the entire cross-chain dispute resolution process", async () => {
      const { claimBlock } = await setupClaimAndChallenge(epoch, batchMerkleRoot, 0);

      const sendSnapshotTx = await veaInbox.connect(bridger).sendSnapshot(
        epoch,
        100000,
        {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestampClaimed: claimBlock.timestamp,
          timestampVerification: 0,
          blocknumberVerification: 0,
          honest: 0,
          challenger: challenger.address,
        },
        { gasLimit: 100000 }
      );

      await expect(sendSnapshotTx)
        .to.emit(veaInbox, "SnapshotSent")
        .withArgs(epoch, ethers.utils.formatBytes32String(""));

      await network.provider.send("evm_increaseTime", [EPOCH_PERIOD]);
      await network.provider.send("evm_mine");

      const routerEvents = await router.queryFilter(router.filters.Routed(), sendSnapshotTx.blockNumber);
      expect(routerEvents.length).to.equal(1, "Expected one Routed event");
      const routedEvent = routerEvents[0];
      expect(routedEvent.args._epoch).to.equal(epoch, "Routed event epoch mismatch");
      expect(routedEvent.args._ticketID).to.not.equal(
        ethers.constants.HashZero,
        "Routed event ticketID should not be zero"
      );

      // Simulate time passing for claim and challenge period
      await network.provider.send("evm_increaseTime", [CHALLENGE_PERIOD + SEQUENCER_DELAY]);
      await network.provider.send("evm_mine");

      const events = await amb.queryFilter(amb.filters.MockedEvent());
      expect(events.length).to.be.above(0, "No MockedEvent emitted");

      // Simulate the passage of time
      await network.provider.send("evm_increaseTime", [EPOCH_PERIOD]);
      await network.provider.send("evm_mine");

      const lastEvent = events[events.length - 1];

      await amb.executeMessageCall(
        veaOutbox.address,
        router.address,
        lastEvent.args._data,
        lastEvent.args.messageId,
        1000000
      );

      expect(await amb.messageCallStatus(lastEvent.args.messageId)).to.be.true;

      // Check for Verified event
      const verifiedEvents = await veaOutbox.queryFilter(veaOutbox.filters.Verified());
      expect(verifiedEvents.length).to.equal(1, "Expected one Verified event");
      const verifiedEvent = verifiedEvents[0];
      expect(verifiedEvent.args._epoch).to.equal(epoch, "Verified event epoch mismatch");

      expect(await veaOutbox.stateRoot()).to.equal(batchMerkleRoot, "VeaOutbox stateRoot should be updated");
      expect(await veaOutbox.latestVerifiedEpoch()).to.equal(epoch, "VeaOutbox latestVerifiedEpoch should be updated");
    });

    it("should allow bridger to withdraw deposit plus reward", async () => {
      const { claimBlock } = await setupClaimAndChallenge(epoch, batchMerkleRoot, 0);

      await simulateDisputeResolution(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: claimBlock.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: challenger.address,
      });

      const bridgerInitialBalance = await weth.balanceOf(bridger.address);
      await veaOutbox.connect(bridger).withdrawClaimDeposit(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: claimBlock.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 1,
        challenger: challenger.address,
      });
      const bridgerFinalBalance = await weth.balanceOf(bridger.address);
      expect(bridgerFinalBalance.sub(bridgerInitialBalance)).to.equal(
        TEN_ETH.add(TEN_ETH.div(2)),
        "Incorrect withdrawal amount"
      );
    });

    it("should not allow challenger to withdraw deposit", async () => {
      const { claimBlock } = await setupClaimAndChallenge(epoch, batchMerkleRoot, 0);

      await simulateDisputeResolution(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: claimBlock.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: challenger.address,
      });

      await expect(
        veaOutbox.connect(challenger).withdrawChallengeDeposit(epoch, {
          stateRoot: batchMerkleRoot,
          claimer: bridger.address,
          timestampClaimed: claimBlock.timestamp,
          timestampVerification: 0,
          blocknumberVerification: 0,
          honest: 1,
          challenger: challenger.address,
        })
      ).to.be.revertedWith("Challenge failed.");
    });

    it("should allow message relay after dispute resolution", async () => {
      const { claimBlock } = await setupClaimAndChallenge(epoch, batchMerkleRoot, 0);

      await simulateDisputeResolution(epoch, {
        stateRoot: batchMerkleRoot,
        claimer: bridger.address,
        timestampClaimed: claimBlock.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: challenger.address,
      });

      const MessageSent = veaInbox.filters.MessageSent();
      const MessageSentEvent = await veaInbox.queryFilter(MessageSent);
      const msg = MessageSentEvent[0].args._nodeData;
      const nonce = "0x" + msg.slice(2, 18);
      const to = "0x" + msg.slice(18, 58);
      const msgData = "0x" + msg.slice(58);

      let nodes: string[] = [];
      nodes.push(MerkleTree.makeLeafNode(nonce, to, msgData));
      const mt = new MerkleTree(nodes);
      const proof = mt.getHexProof(nodes[0]);

      const relayTx = await veaOutbox.connect(receiver).sendMessage(proof, 0, receiverGateway.address, msgData);
      await expect(relayTx).to.emit(veaOutbox, "MessageRelayed").withArgs(0);
    });
  });
});

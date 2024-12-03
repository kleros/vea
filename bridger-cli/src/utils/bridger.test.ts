require("dotenv").config();
import { assert } from "chai";
import { hashClaim } from "../bridger";
import { getVeaOutbox, getVeaInbox } from "./ethers";
import { watch, ShutdownSignal } from "../bridger";
import { JsonRpcProvider } from "@ethersproject/providers";
import { BigNumber, utils } from "ethers";
import { getClaimForEpoch } from "./graphQueries";

describe("Testing bridger-cli", function () {
  console.log = function () {};
  const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const FAKE_HASH = "0x0000000000000000000000000000000000000000000000000000000000000001";
  const mockMessage = {
    data: "0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcd00000000000000000000000000000000000000000000000000000000000003e8",
    to: "0x1234567890abcdef1234567890abcdef12345678",
    fnSelector: "0x12345678",
  };
  const inboxProvider = new JsonRpcProvider("http://localhost:8545");
  const outboxProvider = new JsonRpcProvider("http://localhost:8546");

  let claimEpoch: number;
  let epochPeriod: number;
  let deposit: BigNumber;
  let sequencerDelay: number;

  const veaInbox = getVeaInbox(
    process.env.VEAINBOX_ADDRESS,
    process.env.PRIVATE_KEY,
    "http://localhost:8545",
    Number(process.env.VEAOUTBOX_CHAIN_ID)
  );
  const veaOutbox = getVeaOutbox(
    process.env.VEAOUTBOX_ADDRESS,
    process.env.PRIVATE_KEY,
    "http://localhost:8546",
    Number(process.env.VEAOUTBOX_CHAIN_ID)
  );

  // Increase epoch on both evn chains to maintain consistency
  async function increaseEpoch() {
    await inboxProvider.send("evm_increaseTime", [epochPeriod]);
    await outboxProvider.send("evm_increaseTime", [epochPeriod]);
    await inboxProvider.send("evm_mine", []);
    await outboxProvider.send("evm_mine", []);
  }

  // Start bridger with a timeout
  async function startBridgerWithTimeout(timeout: number, startEpoch: number = 0) {
    const shutDownSignal = new ShutdownSignal();
    const bridgerPromise = watch(shutDownSignal, startEpoch);
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        shutDownSignal.setShutdownSignal();
        resolve("Timeout reached");
      }, timeout);
    });
    await Promise.race([bridgerPromise, timeoutPromise]);
  }

  // Sync epochs on both chains
  async function syncEpochs() {
    const inboxEpoch = Number(await veaInbox.epochNow());
    const outboxEpoch = Number(await veaOutbox.epochNow());
    if (inboxEpoch !== outboxEpoch) {
      if (inboxEpoch > outboxEpoch) {
        await outboxProvider.send("evm_increaseTime", [epochPeriod * (inboxEpoch - outboxEpoch)]);
        await outboxProvider.send("evm_mine", []);
      } else {
        await inboxProvider.send("evm_increaseTime", [epochPeriod * (outboxEpoch - inboxEpoch)]);
        await inboxProvider.send("evm_mine", []);
      }
    }
  }

  beforeEach(async () => {
    epochPeriod = Number(await veaOutbox.epochPeriod());
    deposit = await veaOutbox.deposit();
    await increaseEpoch();
    await syncEpochs();
    claimEpoch = Number(await veaInbox.epochNow());
    sequencerDelay = Number(await veaOutbox.sequencerDelayLimit());
  });

  describe("Unit tests", function () {
    it("should return correct hash for a claim", async function () {
      const claim = {
        stateRoot: "0x771d351d6f9f28f73f6321f0728caf54cda07d9897a4a809ea89cbeda0f084e3",
        claimer: "0xFa00D29d378EDC57AA1006946F0fc6230a5E3288",
        timestampClaimed: 1,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: "0x0000000000000000000000000000000000000000",
      };

      const localHash = hashClaim(claim);
      const contractClaimHash = await veaOutbox.hashClaim(claim);
      assert.equal(localHash, contractClaimHash, "Hashes do not match");
    });
  });

  describe("Integration tests: Claiming", function () {
    it.only("should claim for new saved snapshot", async function () {
      // Send a message and save snapshot
      await veaInbox.sendMessage(mockMessage.to, mockMessage.fnSelector, mockMessage.data);
      await veaInbox.saveSnapshot();

      // Increase epoch so that claim can be made
      await increaseEpoch();

      // Start bridger
      await startBridgerWithTimeout(5000, claimEpoch);

      const toBeClaimedStateRoot = await veaInbox.snapshots(claimEpoch);
      const claimData = await getClaimForEpoch(Number(process.env.VEAOUTBOX_CHAIN_ID), claimEpoch);
      const claim = {
        stateRoot: toBeClaimedStateRoot,
        claimer: claimData.bridger,
        timestampClaimed: claimData.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: "0x0000000000000000000000000000000000000000",
      };
      // Check if claim was made
      const claimHash = await veaOutbox.claimHashes(claimEpoch);
      assert.notEqual(claimHash, ZERO_HASH, "Claim was not made");
      assert.equal(claimHash, hashClaim(claim), "Wrong claim was made");
    });

    it("should not claim for old snapshot", async function () {
      await veaInbox.sendMessage(mockMessage.to, mockMessage.fnSelector, mockMessage.data);

      // Increase epoch on both evn chains to maintain consistency
      await increaseEpoch();

      // Start bridger
      await startBridgerWithTimeout(5000, claimEpoch);

      // Assert no new claims were made since last claim
      const currentEpochClaim = await veaOutbox.claimHashes(claimEpoch);
      assert.equal(currentEpochClaim, ZERO_HASH, "Claim was made");
    });

    it("should make new claim if last claim was challenged", async function () {
      await veaInbox.sendMessage(mockMessage.to, mockMessage.fnSelector, mockMessage.data);
      await veaInbox.saveSnapshot();

      // Increase epoch on both evn chains to maintain consistency
      await increaseEpoch();
      await veaInbox.saveSnapshot();

      // Make claim and challenge it
      await veaOutbox.claim(claimEpoch, FAKE_HASH, { value: deposit });

      const claimData = await getClaimForEpoch(Number(process.env.VEAOUTBOX_CHAIN_ID), claimEpoch);
      const claim = {
        stateRoot: FAKE_HASH,
        claimer: claimData.bridger,
        timestampClaimed: claimData.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: "0x0000000000000000000000000000000000000000",
      };
      await veaOutbox["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](claimEpoch, claim, {
        value: deposit,
      });
      // Increase epoch
      await increaseEpoch();

      await startBridgerWithTimeout(5000, claimEpoch);

      // Check if claim was made
      const claimLogs = await outboxProvider.getLogs({
        address: process.env.VEAOUTBOX_ADDRESS,
        topics: veaOutbox.filters.Claimed(null, utils.hexZeroPad(utils.hexValue(claimEpoch + 1), 32), null).topics,
      });
      const snapshotOnInbox = await veaInbox.snapshots(claimEpoch + 1);
      assert.equal(claimLogs.length, 1, "Claim was not made");
      assert.equal(Number(claimLogs[0].topics[2]), claimEpoch + 1, "Claim was made for wrong epoch");
      assert.equal(snapshotOnInbox, claimLogs[0].data, "Snapshot was not saved");
    });
  });

  describe("Integration tests: Verification", function () {
    it("should start verification when claim is verifiable", async function () {
      await veaInbox.sendMessage(mockMessage.to, mockMessage.fnSelector, mockMessage.data);
      await veaInbox.saveSnapshot();
      await increaseEpoch();

      const savedSnapshot = await veaInbox.snapshots(claimEpoch);
      await veaOutbox.claim(claimEpoch, savedSnapshot, { value: deposit });
      await outboxProvider.send("evm_mine", []);

      await inboxProvider.send("evm_increaseTime", [epochPeriod + sequencerDelay]);
      await inboxProvider.send("evm_mine", []);
      await outboxProvider.send("evm_increaseTime", [epochPeriod + sequencerDelay]);
      await outboxProvider.send("evm_mine", []);

      await startBridgerWithTimeout(5000, claimEpoch);

      // Check if verification was started
      const verificationLogs = await outboxProvider.getLogs({
        address: process.env.VEAOUTBOX_ADDRESS,
        topics: veaOutbox.filters.VerificationStarted(claimEpoch).topics,
      });
      assert.equal(verificationLogs.length, 1, "Verification was not started");
    });

    it("should not verify claim when claim is challenged", async function () {
      await veaInbox.sendMessage(mockMessage.to, mockMessage.fnSelector, mockMessage.data);
      await veaInbox.saveSnapshot();

      await increaseEpoch();

      // Make claim and challenge it
      const claimTx = await veaOutbox.claim(claimEpoch, FAKE_HASH, { value: deposit });

      const oldClaimLogs = await outboxProvider.getLogs({
        address: process.env.VEAOUTBOX_ADDRESS,
        topics: veaOutbox.filters.Claimed(null, utils.hexZeroPad(utils.hexValue(claimEpoch), 32), null).topics,
      });
      const claimBlock = await outboxProvider.getBlock(oldClaimLogs[0].blockNumber);

      let claim = {
        stateRoot: FAKE_HASH,
        claimer: claimTx.from,
        timestampClaimed: claimBlock.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: "0x0000000000000000000000000000000000000000",
      };
      await veaOutbox["challenge(uint256,(bytes32,address,uint32,uint32,uint32,uint8,address))"](claimEpoch, claim, {
        value: deposit,
      });

      await inboxProvider.send("evm_increaseTime", [epochPeriod + sequencerDelay]);
      await inboxProvider.send("evm_mine", []);
      await outboxProvider.send("evm_increaseTime", [epochPeriod + sequencerDelay]);
      await outboxProvider.send("evm_mine", []);

      await startBridgerWithTimeout(5000, claimEpoch);

      const verificationLogs = await outboxProvider.getLogs({
        address: process.env.VEAOUTBOX_ADDRESS,
        topics: veaOutbox.filters.VerificationStarted(claimEpoch).topics,
      });
      assert.equal(verificationLogs.length, 0, "Verification was started");
    });

    it("should verify snapshot when claim is verified", async function () {
      // Also add a test for the case when the claim is not verifiable

      await veaInbox.sendMessage(mockMessage.to, mockMessage.fnSelector, mockMessage.data);
      await veaInbox.saveSnapshot();
      await increaseEpoch();

      const claimTxn = await veaOutbox.claim(claimEpoch, FAKE_HASH, { value: deposit });
      const claimBlock = await outboxProvider.getBlock(claimTxn.blockNumber);
      await inboxProvider.send("evm_increaseTime", [epochPeriod + sequencerDelay]);
      await inboxProvider.send("evm_mine", []);
      await outboxProvider.send("evm_increaseTime", [epochPeriod + sequencerDelay]);
      await outboxProvider.send("evm_mine", []);

      var claim = {
        stateRoot: FAKE_HASH,
        claimer: claimTxn.from,
        timestampClaimed: claimBlock.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: "0x0000000000000000000000000000000000000000",
      };
      const verifyTxn = await veaOutbox.startVerification(claimEpoch, claim);
      const verifyBlock = await outboxProvider.getBlock(verifyTxn.blockNumber);
      claim.timestampVerification = verifyBlock.timestamp;
      claim.blocknumberVerification = verifyBlock.number;

      const minChallengePeriod = Number(await veaOutbox.minChallengePeriod());

      await outboxProvider.send("evm_increaseTime", [minChallengePeriod]);
      await outboxProvider.send("evm_mine", []);

      await startBridgerWithTimeout(5000, claimEpoch);

      const postVerifyStateRoot = await veaOutbox.stateRoot();
      const latestVerifiedEpoch = await veaOutbox.latestVerifiedEpoch();

      assert.equal(postVerifyStateRoot, FAKE_HASH, "Snapshot was not verified");
      assert.equal(Number(latestVerifiedEpoch), claimEpoch, "Snapshot was veified for wrong epoch");
    });

    it("should withdraw deposit when claim is verified", async function () {
      await veaInbox.sendMessage(mockMessage.to, mockMessage.fnSelector, mockMessage.data);
      await veaInbox.saveSnapshot();
      await increaseEpoch();

      const claimTxn = await veaOutbox.claim(claimEpoch, FAKE_HASH, { value: deposit });
      const claimBlock = await outboxProvider.getBlock(claimTxn.blockNumber);
      await inboxProvider.send("evm_increaseTime", [epochPeriod + sequencerDelay]);
      await inboxProvider.send("evm_mine", []);
      await outboxProvider.send("evm_increaseTime", [epochPeriod + sequencerDelay]);
      await outboxProvider.send("evm_mine", []);

      var claim = {
        stateRoot: FAKE_HASH,
        claimer: claimTxn.from,
        timestampClaimed: claimBlock.timestamp,
        timestampVerification: 0,
        blocknumberVerification: 0,
        honest: 0,
        challenger: "0x0000000000000000000000000000000000000000",
      };
      const verifyTxn = await veaOutbox.startVerification(claimEpoch, claim);
      const verifyBlock = await outboxProvider.getBlock(verifyTxn.blockNumber);
      claim.timestampVerification = verifyBlock.timestamp;
      claim.blocknumberVerification = verifyBlock.number;

      const minChallengePeriod = Number(await veaOutbox.minChallengePeriod());

      await outboxProvider.send("evm_increaseTime", [minChallengePeriod]);
      await outboxProvider.send("evm_mine", []);

      await veaOutbox.verifySnapshot(claimEpoch, claim);

      const balancePreWithdraw = Number(await outboxProvider.getBalance(claimTxn.from));
      const contractBalancePreWithdraw = Number(await outboxProvider.getBalance(veaOutbox.address));

      await startBridgerWithTimeout(5000, claimEpoch);
      const balancePostWithdraw = Number(await outboxProvider.getBalance(claimTxn.from));
      const contractBalancePostWithdraw = Number(await outboxProvider.getBalance(veaOutbox.address));
      // Check if deposit was withdrawn
      assert.isAbove(balancePostWithdraw, balancePreWithdraw, "Deposit was not withdrawn");
      assert.equal(
        contractBalancePostWithdraw,
        contractBalancePreWithdraw - Number(deposit),
        "Deposit was not withdrawn"
      );
    });
  });
});

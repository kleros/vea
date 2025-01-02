require("dotenv").config();
import { assert } from "chai";
import { JsonRpcProvider } from "@ethersproject/providers";
import { MockEmitter } from "./utils/emitter";
import { ClaimStruct, hashClaim } from "./utils/claim";
import { getVeaOutbox, getVeaInbox } from "./utils/ethers";
import { watch } from "./bridger";
import { ShutdownSignal } from "./utils/shutdown";

jest.setTimeout(15000);
describe("bridger", function () {
  const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const FAKE_HASH = "0x0000000000000000000000000000000000000000000000000000000000000001";
  const mockMessage = {
    data: "0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcd00000000000000000000000000000000000000000000000000000000000003e8",
    to: "0x1234567890abcdef1234567890abcdef12345678",
    fnSelector: "0x12345678",
  };
  const inboxProvider = new JsonRpcProvider(process.env.VEAINBOX_PROVIDER);
  const outboxProvider = new JsonRpcProvider(process.env.VEAOUTBOX_PROVIDER);

  let claimEpoch: number;
  let epochPeriod: number;
  let deposit: bigint;
  let sequencerDelay: number;

  const veaInbox = getVeaInbox(
    process.env.VEAINBOX_ADDRESS,
    process.env.PRIVATE_KEY,
    process.env.VEAINBOX_PROVIDER,
    Number(process.env.VEAOUTBOX_CHAIN_ID)
  );
  const veaOutbox = getVeaOutbox(
    process.env.VEAOUTBOX_ADDRESS,
    process.env.PRIVATE_KEY,
    process.env.VEAOUTBOX_PROVIDER,
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
    const mockEmitter = new MockEmitter();
    const bridgerPromise = watch(shutDownSignal, startEpoch, mockEmitter);
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

  describe("Integration tests: Claiming", function () {
    it("should claim for new saved snapshot", async function () {
      // Send a message and save snapshot
      await veaInbox.sendMessage(mockMessage.to, mockMessage.fnSelector, mockMessage.data);
      await veaInbox.saveSnapshot();

      // Increase epoch so that claim can be made
      await increaseEpoch();

      // Start bridger
      await startBridgerWithTimeout(5000, claimEpoch);

      const toBeClaimedStateRoot = await veaInbox.snapshots(claimEpoch);
      const claimData = await veaOutbox.queryFilter(veaOutbox.filters.Claimed(null, claimEpoch, null));

      const bridger = `0x${claimData[0].topics[1].slice(26)}`;
      const claimBlock = await outboxProvider.getBlock(claimData[0].blockNumber);
      const claim: ClaimStruct = {
        stateRoot: toBeClaimedStateRoot,
        claimer: bridger as `0x${string}`,
        timestampClaimed: claimBlock.timestamp,
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
      const claimTxn = await veaOutbox.claim(claimEpoch, FAKE_HASH, { value: deposit });
      const claimBlock = await outboxProvider.getBlock(claimTxn.blockNumber);

      const claim = {
        stateRoot: FAKE_HASH,
        claimer: claimTxn.from,
        timestampClaimed: claimBlock.timestamp,
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
      const claimLogs = await veaOutbox.queryFilter(veaOutbox.filters.Claimed(null, claimEpoch + 1, null));

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
      const verificationLogs = await veaOutbox.queryFilter(veaOutbox.filters.VerificationStarted(claimEpoch));
      assert.equal(verificationLogs.length, 1, "Verification was not started");
    });

    it("should not verify claim when claim is challenged", async function () {
      await veaInbox.sendMessage(mockMessage.to, mockMessage.fnSelector, mockMessage.data);
      await veaInbox.saveSnapshot();

      await increaseEpoch();

      // Make claim and challenge it
      const claimTx = await veaOutbox.claim(claimEpoch, FAKE_HASH, { value: deposit });

      const oldClaimLogs = await veaOutbox.queryFilter(veaOutbox.filters.Claimed(null, claimEpoch, null));
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
      await outboxProvider.send("evm_mine", []);

      await inboxProvider.send("evm_increaseTime", [epochPeriod + sequencerDelay]);
      await inboxProvider.send("evm_mine", []);
      await outboxProvider.send("evm_increaseTime", [epochPeriod + sequencerDelay]);
      await outboxProvider.send("evm_mine", []);

      await startBridgerWithTimeout(5000, claimEpoch);

      const verificationLogs = await veaOutbox.queryFilter(veaOutbox.filters.VerificationStarted(claimEpoch));
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

    it("should withdraw deposit when claimer is honest", async function () {
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

      const balancePreWithdraw = await outboxProvider.getBalance(claimTxn.from);
      const contractBalancePreWithdraw = await outboxProvider.getBalance(process.env.VEAOUTBOX_ADDRESS);

      await startBridgerWithTimeout(5000, claimEpoch);
      const balancePostWithdraw = await outboxProvider.getBalance(claimTxn.from);
      const contractBalancePostWithdraw = await outboxProvider.getBalance(process.env.VEAOUTBOX_ADDRESS);

      assert(balancePostWithdraw.gt(balancePreWithdraw), "Deposit was not withdrawn");
      assert(contractBalancePostWithdraw.eq(contractBalancePreWithdraw.sub(deposit)), "Deposit was not withdrawn");
    });

    it.todo("should not withdraw deposit when claimer is dishonest");
  });
});

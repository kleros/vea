# Vea Inbox

The vea inbox is parameterized by a single immutable value --- epochPeriod.

### epochPeriod

<p align="center"><img width="598" alt="image" src="https://user-images.githubusercontent.com/10378902/236885618-b32f91a2-8524-4540-bd1b-7d5f014bbf69.png">
</p>

Epochs mark the period between stateroot snapshots. In other words, epochPeriod defines the highest frequency of bridge operation.

# Vea Outbox

The vea out box is parameterized by a number of immutable and constant values

- epochPeriod
- claimDelay
- challengePeriod
- deposit
- burnAddress, burn, depositPlusReward
- slotTime
- maxMissingBlocks
- timeoutEpochs

### epochPeriod

epochPeriod is the same value as the inbox.

eg. inbox.epochPeriod = 6 hours <=> outbox.epochPeriod = 6 hours

### claimDelay
<p align="center">
<img width="662" alt="image" src="https://user-images.githubusercontent.com/10378902/236887492-ff680e44-40fa-402e-b451-2ac3d402503b.png">
</p>

claimDelay is the time that must pass since an epoch to make a claim about the stateroot of that epoch. The arbitrum sequencer can back date transactions up to 24 hours. The sequencer could withhold 24 hours worth of transactions, and publish them all at once. Nodes will sync catching up with the backlog, after some syncing time, for example 6 hours (benchmarked). Hence the claimDelay must be at least 30 hours.

### challengePeriod

The time during which a claim can be challenged.

### deposit

The deposit which is placed when either a claim or challenge is made. Note half the deposit is burned and the other half compensates the honest party in case of a challenge. deposit / 2 must be sufficient to pay for gas fees to resolve the claim, calling native bridges, even in high gas environments. For example, assuming 100k mainnet gas to resolve claims from arbitrum, given 10,000 gwei gas, the deposit should be at least 2 eth.

#### How do we set a reasonable deposit?

When bridging from Arbitrum, the native bridge takes at least 7 days. 1 day extra in case of L2 censorship by the sequencer (transactions can be force included on L1 after 24 hours). Add some margin for censorship by block producers or potentially of block producers, and the time to resolve disputes over vea inbox stateroots can take ~10 days.

<p align="center">
<img width="791" alt="image" src="https://user-images.githubusercontent.com/10378902/236885812-8c10ee3b-7520-4476-b368-fbbe7bdeca57.png">
</p>

An honest actor needs enough liquidity to challenge fraudulent claims. Given an epochPeriod and liquidity budget we can find the deposit size by

deposit = liquidity budget / (10 days / epochPeriod)

eg. suppose epochPeriod = 12 hours and liquidity budget = 400 eth. Then 10 days / (12 hours/ epoch ) = 20 epochs. In other words, an honest actor needs enough liquidity to cover 20 epochs of deposits to prevent an attacker. So finally, we calculate a reasonable deposit given the budget as

deposit = 400 eth / 20 = 20 eth.

### burnAddress, burn, depositPlusReward

Half the deposit is burned to address(0). The burn = deposit / 2 and depositPlusReward = 2 * deposit - burn are precalculated during contract deployment.

### slotTime

The slot time is set for ethereum consensus destination chains

- ethereum: 12 second slot time
- gnosis: 5 second slot time

### maxMissingBlocks

The maximum number of blocks missing in a challenge period that still satisfy the censorship test.

### timeoutEpochs

Arbitrum today is a permissioned protocol. If the validators stop producing blocks for 7 days, the permissioning of the validator set is dropped, however the arbitrum protocol today is indefinitely delay griefable, so there is a possibility that Arbitrum grinds to a halt, or the Arbitrum contracts are arbitrarily upgraded by the security council multisig.

For these reasons, we can't assume that challenges can ever be resolved. timeoutEpochs defines the number of epochs after which the vea outbox is considered shutdown, and all pending claims and challenges can withdraw their deposits. For example, 2 weeks might be a healthy value when bridging from Arbitrum.

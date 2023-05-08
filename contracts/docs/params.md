# Vea Inbox

The vea inbox is parameterized by a single immutable value --- epochPeriod. 

### epochPeriod

<p align="center"><img width="598" alt="image" src="https://user-images.githubusercontent.com/10378902/236885618-b32f91a2-8524-4540-bd1b-7d5f014bbf69.png">
</p>

Epochs mark the period between stateroot snapshots. In otherwords, epochPeriod defines the highest frequency of bridge operation. Setting an appropriate epochPeriod depends on the deposit and liquidity requirements. 

When bridging from Arbitrum, the native bridge takes atleast 7 days. 1 day extra in case of L2 censorship by the sequencer (txns can be force included on L1 after 24 hours). Add some margin for censorship by block producers or potentially of block producers, and the time to resolve disputes over vea inbox stateroots can take ~10 days.

<p align="center">
<img width="791" alt="image" src="https://user-images.githubusercontent.com/10378902/236885812-8c10ee3b-7520-4476-b368-fbbe7bdeca57.png">
</p>

An honest actor needs enough liquidity to challenge fraudulent claims. Hence, given a liquidity budget, and deposit, the epochPeriod can be set by

epochPeriod = 10 days / (liquidity budget / deposit)

It's more natural to fix the epochPeriod and liquidity budget and find the deposit size by

deposit = liquidity budget / (10 days / epochPeriod)

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

epochPeriod is the same as the inbox.

### claimDelay
<p align="center">
<img width="662" alt="image" src="https://user-images.githubusercontent.com/10378902/236887492-ff680e44-40fa-402e-b451-2ac3d402503b.png">
</p>

claimDelay is a mandatory claim delay. The arbitrum sequencer can back date transactions up to 24 hours. The sequencer could withhold 24 hours worth of transactions, and publish them all at once. Nodes will sync catching up with the backlog, after some syncing time, for example 6 hours. Hence the claimDelay must be atleast 30 hours.

### challengePeriod

The time during which a claim can be challenged.

### deposit

The deposit which is placed when either a claim or challenge is made. Note half the deposit is burned and the other half compensates the honest party in case of a challenge. Note deposit / 2 should be sufficient to pay for gas fees to resolve the claim, calling native bridges, even in high gas environments. For example, assuming 100k mainnet gas to resolve claims from arbitrum, given 10,000 gwei gas, the deposit should be atleast 2 eth.

### burnAddress, burn, depositPlusReward

Half the deposit is burned to address(0). The burn = deposit / 2 and depositPlusReward = 2 * deposit - burn are precalculated during contract deployment.

### slotTime

The slot time is set for ethereum consensus destiation chains

- ethereum: 12 second slot time
- gnosis: 5 second slot time

### maxMissingBlocks

The maximum number of blocks missing in a challenge period and still satisfy the censorship test.

### timeoutEpochs

Arbitrum is today a permissioned protocol. If the validators stop producing blocks for 7 days, the permissioning of the validator set is dropped, however the arbitrum protocol today is indefinetely delay griefable, so there is a possibility that Arbitrum grinds to a halt, or the Arbitrum contracts are arbitrarily upgraded by the security council multisig.

For these reasons, we can't assume that challenges can ever be resolved. timeoutEpochs defines the number of epochs after which the vea outbox is considered shutdown, and all pending claims and challenges can withdraw their deposits. For example, 2 weeks might be a healthy value when bridging from Arbitrum.

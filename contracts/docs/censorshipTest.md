# Censorship Test

The censorship test is based on an eth research [post](https://ethresear.ch/t/reducing-challenge-times-in-rollups/14997) by Ed Felten.

The idea is that ETH Proof of Stake consensus chains, eg Ethereum mainnet and Gnosis Chain, contain enough information in block headers to make statistical conclusions about censorship --- critical when determining the challenge period in optimistic mechanisms such as Vea.

## Formula and examples

X-posting from Ed's [post](https://ethresear.ch/t/reducing-challenge-times-in-rollups/14997),

Assume that each slot is assigned to a non-censoring validator with probability p . Then the probability of seeing k or fewer non-censored blocks in n blocks is equivalent to the probability of getting k or fewer heads when flipping a biased coin that comes up heads with probability p .

The cumulative distribution function is

$$
Pr(X \leq k)=\sum_{i=0}^k\left(\begin{array}{c}
n \\
i
\end{array}\right) p^i(1-p)^{n-i}
$$

which we can calculate numerically in practical cases.

For example, this implies that with n=688 and p=0.1 , we can conclude that Pr(X≤34)<10−6 .

In other words, if we see 34 or fewer missing blocks out of 688 slots, we can conclude that a non-censored block was included with very high confidence. 688 slots is about 2 hours, 18 minutes.

Alternatively, if we see 4 or fewer missing blocks out of 225 slots, we can conclude that a non-censored block was included with very high ( 10−6 ) confidence. 225 slots is 45 minutes.
Observed rate of missing blocks

# Vea Outbox


<p align="center"><img width="770" alt="image" src="https://user-images.githubusercontent.com/10378902/236892050-8756f0bc-e782-496f-9c57-56851db975ef.png"></p>


For this reason, the missing blocks are [checked](https://github.com/kleros/vea/blob/c78180985507611b3f6b69c2863a7a36e1daed47/contracts/src/arbitrumToEth/VeaOutboxArbToEth.sol#L186) when optimistic claims are validated. If too many blocks are missing, the native bridges need to be called to resolve a challenge.

## Missing Blocks

A live view of the past 30 days of missing blocks on mainnet is available [here](https://censorship-oracle-frontend.vercel.app/). A jupyter notebook to calculate censroship test parameters is available [here](https://github.com/shotaronowhere/CensorshipOracle/tree/main/scripts/notebooks).

<p align="center"><img width="756" alt="image" src="https://user-images.githubusercontent.com/10378902/236892359-57ab1122-e810-487b-b7af-bd76681b6688.png"></p>

### Ethereum Mainnet

Over a recent series of 500,000 blocks, 3346 blocks were missing, a rate of 0.67%.

### Gnosis Chain

Over a series ~1,975,776 blocks since the merge, ~90,000 blocks were missing, a rate of 4.3%. 

### Goerli

Over ~7,405,227 blocks missing since the merge, a rate of 4.2%

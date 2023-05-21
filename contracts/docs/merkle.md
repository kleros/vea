# Motivation

Merkle trees are a common tool for data storage. All messages sent through vea are inserted into an append-only merkle tree. 

An optimistic mechanism transfers the root of the tree, then messages can be relayed by proving inclusion in the merkle tree represented by the root (merkle proofs). These proofs are a logarithmic size of the number of messages in the tree.

# Merkle Mountain Range (MMR)

![image](https://user-images.githubusercontent.com/10378902/236598853-a1d8f60c-c5b7-48d8-96ca-3684216388fa.png)

The type of merkle tree implemented in the Vea contracts is sometimes referred to as a merkle mountain range (MMR). Without additional context, merkle trees are usually understood to be perfectly balanced binary trees with a fixed height. MMRs on the other hand grow in height as more leafs are inserted, and can be represented by a set of merkle subtrees, referred to as merkle "mountain ranges" due to their shape, see diagram above (from [Over the Proofs: 🌎 a World of Trees Merkle Mountain Ranges Edition 🛰️](https://codyx.medium.com/over-the-proofs-a-world-of-trees-merkle-mountain-ranges-edition-%EF%B8%8F-dd4ac0e540fc))

# VeaInbox Implementation Details

All leafs are double hashed to avoid [second preimage attacks](https://flawed.net.nz/2018/02/21/attacking-merkle-trees-with-a-second-preimage-attack/).

The [inbox](https://github.com/kleros/vea/blob/c78180985507611b3f6b69c2863a7a36e1daed47/contracts/src/arbitrumToEth/VeaInboxArbToEth.sol#L50) represents the 'mountain ranges' or subtrees of varying height. eg inbox[4] = root of a merkle tree of size 2^4 = 16 leaves. 

For example, when there are 5 messages in the tree, the inbox state is represented by the table below

| Count | Inbox[2] | Inbox[1] | Inbox[0] |
|-------|:--------:|:--------:|:--------:|
| 0b101 |   H(1,4) |  H(3,4)  |   H(5)   |

where we use the notation H as a short-hand for:

- H(1,4) = root of merkle tree representing messages $m_1$, $m_2$, $m_3$, $m_4$
- H(3,4) = root of merkle tree representing messages $m_3$, $m_4$
- H(5) = root of merkle tree representing messages $m_5$

## Notation

$$H(n):= keccak(keccak(m_n)))$$

H(n) represents the n-th leaf which is the double hash of the n-th message $m_n$. 

H(n,m) represents an interior node of the tree which is the merkle root representing the leaves H(n), H(n+1), ..., H(m).

The parent of a pair of nodes is produced by first sort the nodes before concatenating, and hashing.

for example

$$H(1,2):= keccak(H(1) \mathbin{\|\|}H(2))$$

$$H(3,4):= keccak(H(3) \mathbin{\|\|}H(4))$$

$$H(1,4):= keccak(H(1,2) \mathbin{\|\|}H(3,4))$$

Note that we should sort hash pairs before hasing. eg. if $H(2) < H(1)$, $H(1,2) = keccak(H(2) \mathbin{\|\|}H(1))$, above we neglect the sorting notation for brevity.

## Visual Example

<p align="center"><img width="662" alt="image" src="https://user-images.githubusercontent.com/10378902/236891420-d771eb2a-1b40-4570-be5c-a9cbd0d08da4.png"></p>


The table below describes the inbox state for the tree illustrated above.

| Count | Inbox[2] | Inbox[1] | Inbox[0] |
|-------|:--------:|:--------:|:--------:|
| 0b011 |    ---   |  H(1,2)  |   H(3)   |

## Inbox State Examples & Properties

Another example, showing the inbox state step by step for 7 insertions.

| Count | Inbox[2] | Inbox[1] | Inbox[0] |
|-------|:--------:|:--------:|:--------:|
| 0b001 |    ---   |    ---   |   H(1)   |
| 0b010 |    ---   |  H(1,2)  |  "H(1)"  |
| 0b011 |    ---   |  H(1,2)  |   H(3)   |
| 0b100 |  H(1,4)  | "H(1,2)" |  "H(3)"  |
| 0b101 |  H(1,4)  | "H(1,2)" |   H(5)   |
| 0b110 |  H(1,4)  | H(5,6) |   "H(5)"   |
| 0b111 |  H(1,4)  | H(5,6) |   H(7)   |

Note some properties about the on bits ("1s") in count:

- The LSB of count is the only index of inbox modified in each step.

- The on bits of count indicate the minimal data to represent the tree. 

For example, when count = 0b010, inbox[0] is set to H(1). However inbox[1] = H(1,2) which implicitly includes H(1), so inbox[0] is not needed to encode the tree. From the perspective of data availability, we can forget about H(1) in the slot represented by inbox[0]. For that reason it is represented in quotation marks and can be overwritten in future steps, reusing the dirty inbox slot for efficiency.

Moreover, to calculate the root, we hash together the data in each inbox slot corresponding to an on bit in count, from the lowest index to the highest.

examples:

| Count | root |
|-------|:--------:|
| 0b001 |    inbox[0]   |
| 0b010 |    inbox[1]   |
| 0b011 |    H(inbox[1],inbox[0])   |
| 0b100 |  inbox[2]  |
| 0b101 |  H(inbox[2],inbox[0])  |
| 0b110 |  H(inbox[2],inbox[1])  |
| 0b111 |  H(inbox[2],H(inbox[1],inbox[0]))  |

These above properties motivate the inbox implementation.

# Other resources

Here are some useful resources to better understand merkle mountain ranges. The notation and indices used in the below resources differs from the notation used in this document. Resources are meant to be illustrative and supplemental.

- [opentimestamps/opentimestamps-server](https://github.com/opentimestamps/opentimestamps-server/blob/master/doc/merkle-mountain-range.md)
- [mimblewimble/grin](https://github.com/mimblewimble/grin/blob/master/doc/mmr.md)
- [Over the Proofs: 🌎 a World of Trees Merkle Mountain Ranges Edition 🛰️](https://codyx.medium.com/over-the-proofs-a-world-of-trees-merkle-mountain-ranges-edition-%EF%B8%8F-dd4ac0e540fc)

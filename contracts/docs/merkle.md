# Motivation

Merkle trees are a common tool for data storage. All messages sent through vea are inserted into an append only merkle tree. 

An optimistic mechanism transfers the root of the tree, then messages can be relayed by proving inclusion in the merkle tree represented by the root (merkle proofs). These proofs are a logarithmic size of the number of messages in the tree.

# Merkle Mountain Range (MMR)

![image](https://user-images.githubusercontent.com/10378902/236598853-a1d8f60c-c5b7-48d8-96ca-3684216388fa.png)

The type of merkle tree implemented in the Vea contracts is sometimes referred to as a merkle mountain range (MMR). Without additional context, merkle trees are usually understood to be perfectly balanced binary trees with a fixed height. MMRs on the otherhand grow in height as more leafs are inserted, and can be represented by a set of merkle subtrees, refered to as merkle "mountain ranges" due to their shape, see diagram below (from [Over the Proofs: 🌎 a World of Trees Merkle Mountain Ranges Edition 🛰️](https://codyx.medium.com/over-the-proofs-a-world-of-trees-merkle-mountain-ranges-edition-%EF%B8%8F-dd4ac0e540fc))

# VeaInbox Implementation Details

All leafs are double hashed to avoid [second preimage attacks](https://flawed.net.nz/2018/02/21/attacking-merkle-trees-with-a-second-preimage-attack/).

The [inbox](https://github.com/kleros/vea/blob/c78180985507611b3f6b69c2863a7a36e1daed47/contracts/src/arbitrumToEth/VeaInboxArbToEth.sol#L50) represents the 'mountain ranges' or subtrees of varying height. eg  inbox[0] = root of a merkle tree of size 2^0

The bits of the count of the number of elements in the tree indicates the index of subtree in the inbox which represents.

Using a notion where,

H(n):= keccak256(keccak256(n)))

H(n,m):= n>m? keccak256(n concat m): keccak256(m concat n)


<p align="center"><img width="662" alt="image" src="https://user-images.githubusercontent.com/10378902/236891420-d771eb2a-1b40-4570-be5c-a9cbd0d08da4.png"></p>


Then the table below describes the inbox state for the first few insertions. Note H(n,m) sorts n with respect to m. This is a typical and arbitrary ordering convention chosen for convinience.

| Count | Inbox[2] | Inbox[1] | Inbox[0] |
|-------|:--------:|:--------:|:--------:|
| 0b001 |    ---   |    ---   |   H(1)   |
| 0b010 |    ---   |  H(1,2)  |  "H(1)"  |
| 0b011 |    ---   |  H(1,2)  |   H(3)   |
| 0b100 |  H(1,4)  | "H(1,2)" |  "H(3)"  |
| 0b101 |  H(1,4)  | "H(1,2)" |   H(5)   |

- the smallest non-zero bit in the binary representation of count is the largest index of inbox modified.
- the non-zero bits of count indicate the "on" indicies of inbox. eg, for count - 0b010, inbox[0] is set to H(1). However inbox[1] = H(1,2), so inbox[0] is not needed to continue appending to the tree data structure. From the perspective of data availability, we can forget about H(1), for that reason it is represented in quotation marks.
- to calculate the root, only the "on bits" contribute, hashed together from the lowest index to the highest.

# Other resources

Here are some useful resources to better understand merkle mountain ranges.

- [opentimestamps/opentimestamps-server](https://github.com/opentimestamps/opentimestamps-server/blob/master/doc/merkle-mountain-range.md)
- [mimblewimble/grin](https://github.com/mimblewimble/grin/blob/master/doc/mmr.md)
- [Over the Proofs: 🌎 a World of Trees Merkle Mountain Ranges Edition 🛰️](https://codyx.medium.com/over-the-proofs-a-world-of-trees-merkle-mountain-ranges-edition-%EF%B8%8F-dd4ac0e540fc)

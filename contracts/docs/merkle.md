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

## Notation

$$H(n):= keccak(keccak(m_n)))$$

represents the double hash of a message $m_n$. 

The parent root hash of a pair of messages $m_n$ and $m_{n+1}$ is given by, where n is odd and n represents a one-based index of the messages (eg the first message is $m_1$), we have

$$H(n,{n+1}):=
\begin{cases}
    % Specify the function value and condition for each case
    keccak(H(n+1)\mathbin{\|\|} H(n)), & \text{if } H(m_n) > H(n+1) \\
    keccak(H(n)\mathbin{\|\|}H(n+1)), & \text{else}
\end{cases}$$

where we first sort the leaves before concatenating, denoted by $\mathbin{\|\|}$ and hashing.

for example

$$H(1,2):=
\begin{cases}
    % Specify the function value and condition for each case
    keccak(H(2) \mathbin{\|\|}H(1)), & \text{if } H(1) > H(2) \\
    keccak(H(1)\mathbin{\|\|} H(2)), & \text{else}
\end{cases}$$

$$H(3,4):=
\begin{cases}
    % Specify the function value and condition for each case
    keccak(H(4)\mathbin{\|\|}H(3)), & \text{if } H(3) > H(4) \\
    keccak(H(3)\mathbin{\|\|}H(4)), & \text{else}
\end{cases}$$

More generally, we can define the interior nodes for the case where $n \text{ mod } 2^h = 1$ for any integer $h > 1$,

$$H(n,n+2^h-1):=
\begin{cases}
keccak(H(n+2^{h-1},n+2^h-1)\mathbin{\|\|}H(n,n+2^{h-1}-1)), & \text{if } H(n,n+2^{h-1}-1))) > H(n+2^{h-1},n+2^h-1) \\
keccak(H(n,n+2^{h-1}-1)\mathbin{\|\|} H(n+2^{h-1},n+2^h-1)), & \text{else}
\end{cases}$$

for example

$$H(1,4):=
\begin{cases}
    % Specify the function value and condition for each case
    keccak(H(3,4)\mathbin{\|\|}H(1,2))), & \text{if } H(1,2) > H(3,4) \\
    keccak(H(1,2)\mathbin{\|\|}H(3,4))), & \text{else}
\end{cases}$$

$$H(5,8):=
\begin{cases}
    % Specify the function value and condition for each case
    keccak(H(7,8)\mathbin{\|\|}H(5,6))), & \text{if } H(5,6) > H(7,8) \\
    keccak(H(5,6)\mathbin{\|\|} H(7,8))), & \text{else}
\end{cases}$$

$$H(1,8):=
\begin{cases}
    % Specify the function value and condition for each case
    keccak(H(5,8)\mathbin{\|\|}H(1,4))), & \text{if } H(1,2) > H(3,4) \\
    keccak(H(1,4)\mathbin{\|\|} H(5,8))), & \text{else}
\end{cases}$$

## Visual Example

<p align="center"><img width="662" alt="image" src="https://user-images.githubusercontent.com/10378902/236891420-d771eb2a-1b40-4570-be5c-a9cbd0d08da4.png"></p>


Then the table below describes the inbox state for the above tree

| Count | Inbox[2] | Inbox[1] | Inbox[0] |
|-------|:--------:|:--------:|:--------:|
| 0b011 |    ---   |  H(1,2)  |   H(3)   |

## Inbox State Examples & Properties

Then the table below describes the inbox state for the first few insertions. Note H(n,m) sorts n with respect to m. This is a typical and arbitrary ordering convention chosen for convinience.

| Count | Inbox[2] | Inbox[1] | Inbox[0] |
|-------|:--------:|:--------:|:--------:|
| 0b001 |    ---   |    ---   |   H(1)   |
| 0b010 |    ---   |  H(1,2)  |  "H(1)"  |
| 0b011 |    ---   |  H(1,2)  |   H(3)   |
| 0b100 |  H(1,4)  | "H(1,2)" |  "H(3)"  |
| 0b101 |  H(1,4)  | "H(1,2)" |   H(5)   |

Note some properties:

- the smallest non-zero bit in the binary representation of count is the largest index of inbox modified.
- the non-zero bits of count indicate the "on" indicies of inbox. eg, for count - 0b010, inbox[0] is set to H(1). However inbox[1] = H(1,2), so inbox[0] is not needed to continue appending to the tree data structure. From the perspective of data availability, we can forget about H(1), for that reason it is represented in quotation marks.
- to calculate the root, only the "on bits" contribute, hashed together from the lowest index to the highest.

These above properties motivate the inbox implementation.

# Other resources

Here are some useful resources to better understand merkle mountain ranges.

- [opentimestamps/opentimestamps-server](https://github.com/opentimestamps/opentimestamps-server/blob/master/doc/merkle-mountain-range.md)
- [mimblewimble/grin](https://github.com/mimblewimble/grin/blob/master/doc/mmr.md)
- [Over the Proofs: 🌎 a World of Trees Merkle Mountain Ranges Edition 🛰️](https://codyx.medium.com/over-the-proofs-a-world-of-trees-merkle-mountain-ranges-edition-%EF%B8%8F-dd4ac0e540fc)

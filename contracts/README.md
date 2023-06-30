# @kleros/vea-contracts

Smart contracts for Vea.

## Deployed Addresses

Refresh the list of deployed contracts by running `./scripts/generateDeploymentsMarkdown.sh`.

### Current version

#### Goerli

- [RouterArbToGnosisDevnet](https://goerli.etherscan.io/address/0xEC337Fb9977848D0784dC4F01A69c237691755E0)
- [RouterArbToGnosisTestnet](https://goerli.etherscan.io/address/0x1224E83DF410b43A65ed3e375a6442813B1aea14)
- [RouterGnosisToArbDevnet](https://goerli.etherscan.io/address/0xb7d2C76641B21718cC8A0b595be438c863A6e031)
- [RouterGnosisToArbTestnet](https://goerli.etherscan.io/address/0x84de475fed07406aA3B05248f1a7b0Fca11DA012)
- [VeaOutboxArbToEthDevnet](https://goerli.etherscan.io/address/0x3D9356FF595C2151513DFc520380d5A178224564)
- [VeaOutboxArbToEthTestnet](https://goerli.etherscan.io/address/0x4738A566706eDd30Fe175e20eDDd21c5c7bD79Ea)

#### Arbitrum Goerli

- [VeaInboxArbToEthDevnet](https://goerli.arbiscan.io/address/0x935feC4B0bc8f48884f7315153839859832f385b)
- [VeaInboxArbToEthTestnet](https://goerli.arbiscan.io/address/0x0c45C5A1925085fF0672C1052f0b79D5e3ac2A78)
- [VeaInboxArbToGnosisDevnet](https://goerli.arbiscan.io/address/0x8179EBCA5D2EA4152ac61A5BCA7a1dc68f8BbF54)
- [VeaInboxArbToGnosisTestnet](https://goerli.arbiscan.io/address/0xdc201e4Ab6a25A17C1731D8bB7E56f89D0B86486)
- [VeaOutboxGnosisToArbDevnet](https://goerli.arbiscan.io/address/0x8Da07C6D68F17d7BbC8B42D59Bc9EEE90e9dD621)
- [VeaOutboxGnosisToArbTestnet](https://goerli.arbiscan.io/address/0x62581B897330CA4044C4db79Ebe96ca230569492)

#### Chiado

- [VeaInboxGnosisToArbDevnet](https://blockscout.com/gnosis/chiado/address/0x9F4407785DFf95c08Bf9a0d9d4A5a164C48eC5CB)
- [VeaInboxGnosisToArbTestnet](https://blockscout.com/gnosis/chiado/address/0x8Bf88E6474d93bD2Dc0d76CB3BE8809c6BB84148)
- [VeaOutboxArbToGnosisDevnet](https://blockscout.com/gnosis/chiado/address/0xb0263478A46d885D715B01fbac745500B9576634)
- [VeaOutboxArbToGnosisTestnet](https://blockscout.com/gnosis/chiado/address/0xE8ea62d3a4F06301016b9C23Ace108F3D8027839)

## Getting Started

### Install the Dependencies

```bash
yarn install
```

### Run Tests

```bash
yarn test
```

### Compile the Contracts

```bash
yarn build
```

### Run Linter on Files

```bash
yarn check
```

### Deployment

**NOTICE:** the commands below work only if you are inside the `contracts/` directory.

#### 0. Set the Environment Variables

Copy `.env.example` file as `.env` and edit it accordingly.

```bash
cp .env.example .env
```

The following env vars are required:

- `PRIVATE_KEY`: the private key of the deployer account used for the testnets.
- `MAINNET_PRIVATE_KEY`: the private key of the deployer account used for Mainnet.
- `INFURA_API_KEY`: the API key for infura.

The ones below are optional:

- `ETHERSCAN_API_KEY`: to verify the source of the newly deployed contracts on **Etherscan**.
- `ARBISCAN_API_KEY`: to verify the source of the newly deployed contracts on **Arbitrum**.

#### 1. Update the Constructor Parameters (optional)

If some of the constructor parameters (such as the Meta Evidence) needs to change, you need to update the files in the `deploy/` directory.

#### 2. Deploy to a Local Network

```bash
yarn start-local
```

#### 3. Deploy to Public Networks

##### Testnets

```bash
# ArbitrumGoerli -> Goerli
yarn deploy --network goerli --tags ArbGoerliToGoerliOutbox
yarn deploy --network arbitrumGoerli --tags ArbGoerliToGoerliInbox

# ArbitrumGoerli -> Chiado
yarn deploy --network chiado --tags ArbGoerliToChiadoOutbox
yarn deploy --network arbitrumGoerli --tags ArbGoerliToChiadoInbox
```

##### Mainnets

```bash
# Arbitrum -> Ethereum
yarn deploy --network mainnet --tags ArbToEthOutbox
yarn deploy --network arbitrum --tags ArbToEthInbox

# Arbitrum -> Gnosis chain
yarn deploy --network gnosischain --tags ArbToGnosisOutbox
yarn deploy --network arbitrum --tags ArbToGnosisInbox
```

The deployed addresses should be output to the screen after the deployment is complete.
If you miss that, you can always go to the `deployments/<network>` directory and look for the respective file.

#### Running Test Fixtures

```bash
yarn test
```

#### 4. Verify the Source Code

This must be done for each network separately.

```bash
# explorer
yarn etherscan-verify --network <arbitrumGoerli|arbitrum|goerli|mainnet|chiado|gnosischain>

# sourcify
yarn sourcify --network <arbitrumGoerli|arbitrum|goerli|mainnet|chiado|gnosischain>
```

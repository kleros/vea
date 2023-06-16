# @kleros/vea-contracts

Smart contracts for Vea.

## Deployed Addresses

Refresh the list of deployed contracts by running `./scripts/generateDeploymentsMarkdown.sh`.

### Current version

#### Goerli

- [RouterArbToGnosisDevnet](https://goerli.etherscan.io/address/0x696567a5F0A6DD4aAe1dBa6ddB4c977aB5B07CAC)
- [RouterArbToGnosisTestnet](https://goerli.etherscan.io/address/0x57566eBB95e855fdAeEe108Afa450005B12123Bb)
- [VeaOutboxArbToEthDevnet](https://goerli.etherscan.io/address/0xb594c5C4eE3bF976d59F5d3DB311A1ac99D20FBA)
- [VeaOutboxArbToEthTestnet](https://goerli.etherscan.io/address/0x64277c8c817b45B0e3CE45AbC222f16406920B9a)

#### Arbitrum Goerli

- [VeaInboxArbToEthDevnet](https://goerli.arbiscan.io/address/0x3D9356FF595C2151513DFc520380d5A178224564)
- [VeaInboxArbToEthTestnet](https://goerli.arbiscan.io/address/0xa452Eecf27B545E4115E1cD3cC903aC361B1eE22)
- [VeaInboxArbToGnosisDevnet](https://goerli.arbiscan.io/address/0xEC337Fb9977848D0784dC4F01A69c237691755E0)
- [VeaInboxArbToGnosisTestnet](https://goerli.arbiscan.io/address/0xf2DDe00c51be42c74e3927A324928381f83da37f)

#### Chiado

- [VeaOutboxArbToGnosisDevnet](https://blockscout.com/gnosis/chiado/address/0x00f0A751C921B937208e49a92fAaeaF896733544)
- [VeaOutboxArbToGnosisTestnet](https://blockscout.com/gnosis/chiado/address/0x0C3Acd25FE091b02e8E9b30B9b51dBD5d58C8a41)

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

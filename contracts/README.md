# @kleros/vea-contracts

Smart contracts for Vea.

## Deployed Addresses

Refresh the list of deployed contracts by running `./scripts/generateDeploymentsMarkdown.sh`.

### Current version

#### Goerli

- [RouterArbToGnosisDevnet](https://goerli.etherscan.io/address/0xAb53e341121448Ae259Da8fa17f216Cb0e21199C)
- [VeaOutboxArbToEthDevnet](https://goerli.etherscan.io/address/0x906dE43dBef27639b1688Ac46532a16dc07Ce410)

#### Arbitrum Goerli

- [VeaInboxArbToEthDevnet](https://goerli.arbiscan.io/address/0x906dE43dBef27639b1688Ac46532a16dc07Ce410)
- [VeaInboxArbToGnosisDevnet](https://goerli.arbiscan.io/address/0xAb53e341121448Ae259Da8fa17f216Cb0e21199C)

#### Chiado

- [VeaOutboxArbToGnosisDevnet](https://blockscout.com/gnosis/chiado/address/0xAb53e341121448Ae259Da8fa17f216Cb0e21199C)

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

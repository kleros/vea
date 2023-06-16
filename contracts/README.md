# @kleros/vea-contracts

Smart contracts for Vea.

## Deployed Addresses

Refresh the list of deployed contracts by running `./scripts/generateDeploymentsMarkdown.sh`.

### Current version

#### Goerli

- [RouterArbToGnosisDevnet](https://goerli.etherscan.io/address/0x770cDAF7284B8838c699910433A927a49bB6765A)
- [RouterArbToGnosisTestnet](https://goerli.etherscan.io/address/0x8228116e0d5Fd2611788E68fF77D5f21b005cE11)
- [VeaOutboxArbToEthDevnet](https://goerli.etherscan.io/address/0x8dC6CCd123E680018923000854dE7E293E744DA0)
- [VeaOutboxArbToEthTestnet](https://goerli.etherscan.io/address/0x6dfc228652A6eE943eA37c269E2602BF2e198Ae9)

#### Arbitrum Goerli

- [VeaInboxArbToEthDevnet](https://goerli.arbiscan.io/address/0x1224E83DF410b43A65ed3e375a6442813B1aea14)
- [VeaInboxArbToEthTestnet](https://goerli.arbiscan.io/address/0xb7d2C76641B21718cC8A0b595be438c863A6e031)
- [VeaInboxArbToGnosisDevnet](https://goerli.arbiscan.io/address/0x84de475fed07406aA3B05248f1a7b0Fca11DA012)
- [VeaInboxArbToGnosisTestnet](https://goerli.arbiscan.io/address/0x4738A566706eDd30Fe175e20eDDd21c5c7bD79Ea)

#### Chiado

- [VeaOutboxArbToGnosisDevnet](https://blockscout.com/gnosis/chiado/address/0xEe27226A8fa11Ba851410EB09d32884aEE219D75)
- [VeaOutboxArbToGnosisTestnet](https://blockscout.com/gnosis/chiado/address/0x359c4E8225866aB97ab054ec36aBe923e70eF741)

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

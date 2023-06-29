# @kleros/vea-contracts

Smart contracts for Vea.

## Deployed Addresses

Refresh the list of deployed contracts by running `./scripts/generateDeploymentsMarkdown.sh`.

### Current version

#### Goerli

- [RouterArbToGnosisDevnet](https://goerli.etherscan.io/address/0xef62E517bE7e319458f41014C4d8864117381255)
- [RouterArbToGnosisTestnet](https://goerli.etherscan.io/address/0x7Ee8Ad48EfA4765257a49486421A4CF11389E480)
- [RouterGnosisToArbDevnet](https://goerli.etherscan.io/address/0x65b577dC22D3bdfcB20298ac07EF99D574275D04)
- [RouterGnosisToArbTestnet](https://goerli.etherscan.io/address/0x531754c9935A851173FA349b3bEadAF538c570aC)
- [VeaOutboxArbToEthDevnet](https://goerli.etherscan.io/address/0x4B1275adA5014d7A10375B87bb0cfaCAbC47d3dC)
- [VeaOutboxArbToEthTestnet](https://goerli.etherscan.io/address/0x356f5D0756ab15C819015960C355386d0367d545)

#### Arbitrum Goerli

- [VeaInboxArbToEthDevnet](https://goerli.arbiscan.io/address/0xe81afBecf7d0bB755fB9f1fb417b95Bf924534e6)
- [VeaInboxArbToEthTestnet](https://goerli.arbiscan.io/address/0xB00b74346d6cb2440F71cc3Fb19Cd2B50450571E)
- [VeaInboxArbToGnosisDevnet](https://goerli.arbiscan.io/address/0x7CE671804C3bC9096669F37cE6a7419BA66b7fD8)
- [VeaInboxArbToGnosisTestnet](https://goerli.arbiscan.io/address/0x5EC6917F803bF2C9E55D43D3B7DD1032a625A979)
- [VeaOutboxGnosisToArbDevnet](https://goerli.arbiscan.io/address/0x016170Ad327cE0dCa07b3bd7a7592013a7488FAc)
- [VeaOutboxGnosisToArbTestnet](https://goerli.arbiscan.io/address/0xF0492e87Be6d644A6a467fE20ee9EC5eFCB6cB23)

#### Chiado

- [VeaInboxGnosisToArbDevnet](https://blockscout.com/gnosis/chiado/address/0xA3FefC6FeE3fc66B9d9a8BEE794736ab71a74c55)
- [VeaInboxGnosisToArbTestnet](https://blockscout.com/gnosis/chiado/address/0xfF2B7048d673767754B798df1702C786E2c59F1F)
- [VeaOutboxArbToGnosisDevnet](https://blockscout.com/gnosis/chiado/address/0x660daB9A6436A814a6ae3a6f27b309356a4bE78c)
- [VeaOutboxArbToGnosisTestnet](https://blockscout.com/gnosis/chiado/address/0x9cF5c011e2A4CB7797413f311A35AcB021071c35)

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

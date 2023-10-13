# @kleros/vea-contracts

Smart contracts for Vea.

## Deployed Addresses

Refresh the list of deployed contracts by running `./scripts/generateDeploymentsMarkdown.sh`.

### Current version

#### Goerli

- [RouterArbToGnosisDevnet](https://goerli.etherscan.io/address/0x6164EA58a1f5359D2E54ea8eB9e5971B7C8dB0f1)
- [RouterArbToGnosisTestnet](https://goerli.etherscan.io/address/0x5Df4452965cd2ff87f205AE5b10b5d0F65223116)
- [RouterGnosisToArbDevnet](https://goerli.etherscan.io/address/0xcC196cC90bD30109E39400817e6ef63A1b744659)
- [RouterGnosisToArbTestnet](https://goerli.etherscan.io/address/0x6bC3C7Bcd2C6C2d8BFEAA3642c425cAE25F7fe17)
- [VeaOutboxArbToEthDevnet](https://goerli.etherscan.io/address/0xDa528e9BE20a8A22437D28Ed6C63bb6d00Ad0032)
- [VeaOutboxArbToEthTestnet](https://goerli.etherscan.io/address/0xDF216C98773DA7998EE49AE8106BFe9724cf2944)

#### Arbitrum Goerli

- [VeaInboxArbToEthDevnet](https://goerli.arbiscan.io/address/0xE99C6177CD8731DE6F108443CcAf7449074f6aED)
- [VeaInboxArbToEthTestnet](https://goerli.arbiscan.io/address/0x95100f56d040fD48AA52dcDD05A9Fc477d55bd2E)
- [VeaInboxArbToGnosisDevnet](https://goerli.arbiscan.io/address/0xf38b8739635d2F4cb38Bd453453AB9d41fD16300)
- [VeaInboxArbToGnosisTestnet](https://goerli.arbiscan.io/address/0x1418a26Ca3A73a0EA3aBf943E8B524bEFD7C96cD)
- [VeaOutboxGnosisToArbDevnet](https://goerli.arbiscan.io/address/0xE14fA0B3910CB0853E811375B9a6fcEEE32db521)
- [VeaOutboxGnosisToArbTestnet](https://goerli.arbiscan.io/address/0x18AB70ea8dBc7072D1C1C90bA0bC1547d92198CF)

#### Chiado

- [VeaInboxGnosisToArbDevnet](https://blockscout.com/gnosis/chiado/address/0xc0804E4FcEEfD958050356A429DAaaA71aA39385)
- [VeaInboxGnosisToArbTestnet](https://blockscout.com/gnosis/chiado/address/0xC21c20a719fAc23c54c336FA0E16a0CFdC4baA00)
- [VeaOutboxArbToGnosisDevnet](https://blockscout.com/gnosis/chiado/address/0x9481b3A49ac67d03D9022E6200eFD81850BADDB4)
- [VeaOutboxArbToGnosisTestnet](https://blockscout.com/gnosis/chiado/address/0x931FA807020231bCE1340Be8E1e5054207BbAFEd)

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

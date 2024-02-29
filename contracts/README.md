# @kleros/vea-contracts

Smart contracts for Vea.

## Deployed Addresses

Refresh the list of deployed contracts by running `./scripts/generateDeploymentsMarkdown.sh`.

### Current version

#### Sepolia

- [VeaOutboxArbToEthDevnet](https://sepolia.etherscan.io/address/0x5AD255400913515C8DA7E82E6b8A109fA5c46135)

#### Arbitrum Sepolia

- [VeaInboxArbToEthDevnet](https://sepolia.arbiscan.io/address/0x77e95F54032f467eC45c48C6affc203f93858783)

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
# arbitrumSepolia -> Goerli
yarn deploy --network goerli --tags ArbGoerliToGoerliOutbox
yarn deploy --network arbitrumSepolia --tags ArbGoerliToGoerliInbox

# arbitrumSepolia -> Chiado
yarn deploy --network chiado --tags ArbGoerliToChiadoOutbox
yarn deploy --network arbitrumSepolia --tags ArbGoerliToChiadoInbox
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
yarn etherscan-verify --network <arbitrumSepolia|arbitrum|goerli|mainnet|chiado|gnosischain>

# sourcify
yarn sourcify --network <arbitrumSepolia|arbitrum|goerli|mainnet|chiado|gnosischain>
```

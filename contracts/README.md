# @kleros/vea-contracts

Smart contracts for Vea.

## Deployed Addresses

Refresh the list of deployed contracts by running `./scripts/generateDeploymentsMarkdown.sh`.

### Current version

#### Sepolia

- [RouterArbToGnosisDevnet](https://sepolia.etherscan.io/address/0xA699e7246D7AF936752789408A071805CC8c99c3)
- [RouterArbToGnosisTestnet](https://sepolia.etherscan.io/address/0x22d70804d4Ef5BB206C6B39e3267DFe8a0f97d27)
- [VeaOutboxArbToEthDevnet](https://sepolia.etherscan.io/address/0xb8BF3B6bd3E1a0Cc9E2dB77dd492503310514674)
- [VeaOutboxArbToEthTestnet](https://sepolia.etherscan.io/address/0x209BFdC6B7c66b63A8382196Ba3d06619d0F12c9)

#### Arbitrum Sepolia

- [VeaInboxArbToEthDevnet](https://sepolia.arbiscan.io/address/0x0B5851fE2a931F619F73E739E5435C43976f1D68)
- [VeaInboxArbToEthTestnet](https://sepolia.arbiscan.io/address/0xE12daFE59Bc3A996362d54b37DFd2BA9279cAd06)
- [VeaInboxArbToGnosisDevnet](https://sepolia.arbiscan.io/address/0x496df82A2fE2f4aa6903C8bdcE759a94505E7D0c)
- [VeaInboxArbToGnosisTestnet](https://sepolia.arbiscan.io/address/0x854374483572FFcD4d0225290346279d0718240b)

#### Chiado

- [VeaInboxGnosisToArbDevnet](https://blockscout.com/gnosis/chiado/address/0xc0804E4FcEEfD958050356A429DAaaA71aA39385)
- [VeaOutboxArbToGnosisDevnet](https://blockscout.com/gnosis/chiado/address/0xAebcedf346f168E5CEaB7Cd367118d2176486ad7)
- [VeaOutboxArbToGnosisTestnet](https://blockscout.com/gnosis/chiado/address/0x2f1788F7B74e01c4C85578748290467A5f063B0b)

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
# arbitrumSepolia -> Sepolia
yarn deploy --network sepolia --tags ArbSepoliaToSepoliaOutbox
yarn deploy --network arbitrumSepolia --tags ArbSepoliaToSepoliaInbox

# arbitrumSepolia -> Chiado
yarn deploy --network chiado --tags ArbSepoliaToChiadoOutbox
yarn deploy --network arbitrumSepolia --tags ArbSepoliaToChiadoInbox
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
yarn etherscan-verify --network <arbitrumSepolia|arbitrum|sepolia|mainnet|chiado|gnosischain>

# sourcify
yarn sourcify --network <arbitrumSepolia|arbitrum|sepolia|mainnet|chiado|gnosischain>
```

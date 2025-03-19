# @kleros/vea-contracts

Smart contracts for Vea.

---

- **[Deployed Addresses](#deployed-addresses)**
  - **[Sepolia](#sepolia)**
  - **[Arbitrum Sepolia](#arbitrum-sepolia)**
  - **[Chiado](#chiado)**
- **[Getting Started](#getting-started)**
  - **[Install the Dependencies](#install-the-dependencies)**
  - **[Run Tests](#run-tests)**
  - **[Compile the Contracts](#compile-the-contracts)**
  - **[Run Linter on Files](#run-linter-on-files)**
  - **[Deployment](#deployment)**

---

## Deployed Addresses

Refresh the list of deployed contracts by running `./scripts/populateReadme.sh`.

### Sepolia

- [RouterArbToGnosisDevnet](https://sepolia.etherscan.io/address/0xbD6c557295cBDd57e0efC408b20096f3fe55C8a6)
- [RouterArbToGnosisTestnet](https://sepolia.etherscan.io/address/0x66C85D0375b0CbD1bBeB4F7D5E73c181BAf8454e)
- [VeaOutboxArbToEthDevnet](https://sepolia.etherscan.io/address/0xb1f5125b52CE23D3763AC1C9ACEf0668825A66c0)
- [VeaOutboxArbToEthTestnet](https://sepolia.etherscan.io/address/0x209BFdC6B7c66b63A8382196Ba3d06619d0F12c9)

### Arbitrum Sepolia

- [VeaInboxArbToEthDevnet](https://sepolia.arbiscan.io/address/0xF6C5640de593fEf76129F1F1A863F7ddc65776C9)
- [VeaInboxArbToEthTestnet](https://sepolia.arbiscan.io/address/0xE12daFE59Bc3A996362d54b37DFd2BA9279cAd06)
- [VeaInboxArbToGnosisDevnet](https://sepolia.arbiscan.io/address/0xF6286b9C6c7F1B33Ea976FA43434027c7b8421A7)
- [VeaInboxArbToGnosisTestnet](https://sepolia.arbiscan.io/address/0x62403e9Fbac618301175C89fb21920e4FF235A6a)

### Chiado

- [VeaInboxGnosisToArbDevnet](https://blockscout.com/gnosis/chiado/address/0xc0804E4FcEEfD958050356A429DAaaA71aA39385)
- [VeaOutboxArbToGnosisDevnet](https://blockscout.com/gnosis/chiado/address/0xE24B2838962207F585F4fa5C5bE3e1AcA43a1a1B)
- [VeaOutboxArbToGnosisTestnet](https://blockscout.com/gnosis/chiado/address/0xb78afF106DcB5fD0768a348a804bbc4DCacB3233)

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

If some of the constructor parameters needs to change, you need to update the files in the `deploy/` directory.

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

#### 4. Running Test Fixtures

```bash
yarn test
```

#### 5. Verify the Source Code

This must be done for each network separately.

```bash
# explorer
yarn etherscan-verify --network <arbitrumSepolia|arbitrum|sepolia|mainnet|chiado|gnosischain>

# sourcify
yarn sourcify --network <arbitrumSepolia|arbitrum|sepolia|mainnet|chiado|gnosischain>
```

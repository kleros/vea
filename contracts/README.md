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

- [RouterArbToGnosisDevnet](https://sepolia.etherscan.io/address/0xfA08cfe2530c01045D953f824b836f6757670cD0)
- [RouterArbToGnosisTestnet](https://sepolia.etherscan.io/address/0xd7C54E4cA686a8C51D44534AC6b756676961Fccf)
- [VeaOutboxArbToEthDevnet](https://sepolia.etherscan.io/address/0x60af9Fc1dd7d5bce69a66A8AEf456952b03A39C7)
- [VeaOutboxArbToEthTestnet](https://sepolia.etherscan.io/address/0xf720FA4575FB2FE96c7f05B1b5abc2d281cDa09a)

### Arbitrum Sepolia

- [VeaInboxArbToEthDevnet](https://sepolia.arbiscan.io/address/0x45138BC4E364A16919C4571699171d774A7590BD)
- [VeaInboxArbToEthTestnet](https://sepolia.arbiscan.io/address/0x8B925669606026CcCfAFD72840F5b0CAeDA80078)
- [VeaInboxArbToGnosisDevnet](https://sepolia.arbiscan.io/address/0x2E973e20B24088bc74755a7A5cd1A37Dcb53E061)
- [VeaInboxArbToGnosisTestnet](https://sepolia.arbiscan.io/address/0x162f826E18380567CE0548395a3Ad2A54EA87B96)

### Chiado

- [VeaInboxGnosisToArbDevnet](https://blockscout.com/gnosis/chiado/address/0xc0804E4FcEEfD958050356A429DAaaA71aA39385)
- [VeaOutboxArbToGnosisDevnet](https://blockscout.com/gnosis/chiado/address/0x879A9F4476D4445A1deCf40175a700C4c829824D)
- [VeaOutboxArbToGnosisTestnet](https://blockscout.com/gnosis/chiado/address/0x15aC29269b044E1d9042F597513B27Ffa4A7f257)

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

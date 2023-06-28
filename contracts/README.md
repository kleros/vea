# @kleros/vea-contracts

Smart contracts for Vea.

## Deployed Addresses

Refresh the list of deployed contracts by running `./scripts/generateDeploymentsMarkdown.sh`.

### Current version

#### Goerli

- [RouterArbToGnosisDevnet](https://goerli.etherscan.io/address/0x8Bf88E6474d93bD2Dc0d76CB3BE8809c6BB84148)
- [RouterArbToGnosisTestnet](https://goerli.etherscan.io/address/0x931FA807020231bCE1340Be8E1e5054207BbAFEd)
- [RouterGnosisToArbDevnet](https://goerli.etherscan.io/address/0x21596998458c428d745d171FA0636B885ed18DaC)
- [RouterGnosisToArbTestnet](https://goerli.etherscan.io/address/0xC21c20a719fAc23c54c336FA0E16a0CFdC4baA00)
- [VeaOutboxArbToEthDevnet](https://goerli.etherscan.io/address/0xE8ea62d3a4F06301016b9C23Ace108F3D8027839)
- [VeaOutboxArbToEthTestnet](https://goerli.etherscan.io/address/0x92Cd1F40e5A4FFa25f83Dd9231EBD9df02eD6a5F)

#### Arbitrum Goerli

- [VeaInboxArbToEthDevnet](https://goerli.arbiscan.io/address/0xDa528e9BE20a8A22437D28Ed6C63bb6d00Ad0032)
- [VeaInboxArbToEthTestnet](https://goerli.arbiscan.io/address/0xE732B5b0DEE43619031e080Da461059F75a260E2)
- [VeaInboxArbToGnosisDevnet](https://goerli.arbiscan.io/address/0x6164EA58a1f5359D2E54ea8eB9e5971B7C8dB0f1)
- [VeaInboxArbToGnosisTestnet](https://goerli.arbiscan.io/address/0x76fa89666bd55736832a4350b9B8dA6bB1878BeF)
- [VeaOutboxGnosisToArbDevnet](https://goerli.arbiscan.io/address/0xcC196cC90bD30109E39400817e6ef63A1b744659)
- [VeaOutboxGnosisToArbTestnet](https://goerli.arbiscan.io/address/0x663697f5748c5f4d46a15114Dde5514356E794F4)

#### Chiado

- [VeaInboxGnosisToArbDevnet](https://blockscout.com/gnosis/chiado/address/0xe4AF4f1B42749d003C6d6eFdc05c11F33581E55B)
- [VeaInboxGnosisToArbTestnet](https://blockscout.com/gnosis/chiado/address/0xB10EF39cc9b45A8EAfa87655063E3dD83D675075)
- [VeaOutboxArbToGnosisDevnet](https://blockscout.com/gnosis/chiado/address/0xE2067941210d684bA8171F7C9dF372931fC6c245)
- [VeaOutboxArbToGnosisTestnet](https://blockscout.com/gnosis/chiado/address/0x0E459f63db78E2d5E8DC16a717F30A3d24cb79c2)

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

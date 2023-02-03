# @kleros/vea-contracts

Smart contracts for Vea.

## Deployed Addresses

Refresh the list of deployed contracts by running `./scripts/generateDeploymentsMarkdown.sh`.

### Current version

#### Arbitrum Goerli

- [FastBridgeSenderToGnosis](https://goerli.arbiscan.io/address/0x642B66C5D0F8c620C35264F2d2899A0E209D68d9)

#### Chiado

- [FastBridgeReceiverOnGnosis](https://blockscout.com/gnosis/chiado/address/0x26858D60FE92b50b34e236B46874e02724344275)

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
yarn lint
```

### Fix Linter Issues on Files

```bash
yarn fix
```

### Deploy Instructions

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

:warning: TODO: OUTDATED, FIX ME
The complete deployment is multi-chain, so a deployment to the local network can only simulate either the Home chain or the Foreign chain.

**Shell 1: the node**

```bash
yarn hardhat node --tags nothing
```

**Shell 2: the deploy script**

```bash
yarn hardhat deploy --network localhost --tags HomeChain
```

#### 3. Deploy to Public Testnets

:warning: TODO: OUTDATED, FIX ME

```bash
# Goerli
yarn hardhat deploy --network arbitrumGoerli --tags Arbitration
yarn hardhat deploy --network goerli --tags ForeignChain
yarn hardhat deploy --network arbitrumGoerli --tags HomeChain

# Rinkeby
yarn hardhat deploy --network arbitrumRinkeby --tags Arbitration
yarn hardhat deploy --network rinkeby --tags ForeignChain
yarn hardhat deploy --network arbitrumRinkeby --tags HomeChain
```

The deployed addresses should be output to the screen after the deployment is complete.
If you miss that, you can always go to the `deployments/<network>` directory and look for the respective file.

#### Running Test Fixtures

:warning: TODO: OUTDATED, FIX ME

**Shell 1: the node**

```bash
yarn hardhat node --tags Arbitration,ForeignGateway,HomeGateway
```

**Shell 2: the test script**

```bash
yarn hardhat test --network localhost test/pre-alpha1/index.ts
```

#### 4. Verify the Source Code for Contracts

This must be done for each network separately.

```bash
yarn hardhat --network <arbitrumGoerli|arbitrumRinkeby|arbitrum|goerli|rinkeby|mainnet> etherscan-verify
```

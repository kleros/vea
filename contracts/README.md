# @kleros/vea-contracts

Smart contracts for Vea.

## Deployed Addresses

Refresh the list of deployed contracts by running `./scripts/generateDeploymentsMarkdown.sh`.

### Current version

#### Goerli

- [FastBridgeReceiverOnEthereum](https://goerli.etherscan.io/address/0x87142b7E9C7D026776499120D902AF8896C07894)
- [ForeignGatewayOnEthereum](https://goerli.etherscan.io/address/0xf08273e2B35E78509B027f6FAa32485844EA7cCA)

#### Arbitrum Goerli

- [FastBridgeSender](https://goerli.arbiscan.io/address/0x6b575B3af80aDca9E5ABE1764Ae9dE439e85DEb7)
- [HomeGatewayToEthereum](https://goerli.arbiscan.io/address/0xc7e3BF90299f6BD9FA7c3703837A9CAbB5743636)
- [SenderGatewayToEthereum](https://goerli.arbiscan.io/address/0x6B43B4DA9ad839dc806e696A248731A65F61f5d9)
- [SenderGatewayToGnosis](https://goerli.arbiscan.io/address/0x42319536AA7eD5E0A6CBCAF3FaaDb5243d482C7A)

#### Chiado

- [FastBridgeReceiverOnEthereum](https://blockscout.chiadochain.net/address/0xa1711e979d7F9ae5f4c5Fe57D5fF7d6F5Ae3d418)
- [FastBridgeReceiverOnGnosis](https://blockscout.chiadochain.net/address/0x730Ec040763bf5C4Abac1d66d7c757f6033a3A20)
- [ReceiverGatewayOnEthereum](https://blockscout.chiadochain.net/address/0xD986380c607350762D802646AAad4eea809219Df)
- [ReceiverGatewayOnGnosis](https://blockscout.chiadochain.net/address/0xA1EcD2e86E9C674762aC68de90edfdb171c8e302)

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

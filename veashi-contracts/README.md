## Contracts

**This directory contains the core smart contracts for briding with Hashi using three bridges LayerZero,Vea and CCIP. It also includes deployment scripts used to set up and configure cross-chain routes between networks.**

## Relevant links

[Hashi](https://crosschain-alliance.gitbook.io/hashi/meta/explorer$0)<br>
[Vea](https://docs.vea.ninja/$0) <br>
[LayerZero](https://docs.layerzero.network/v2/developers/evm/overview$0) <br>
[CCIP](https://docs.chain.link/ccip$0)

## Usage

### Build

```shell
$ forge build
```

### Format

```shell
$ forge fmt
```

### Deploy

Copy `.env.example` to `.env` and fill in the required values.

```shell
$ export SOURCE_RPC=https://x.io
$ export DESTINATION_RPC=https://y.io

$ ./script/deploy-route.sh --reporter-chain $SOURCE_RPC --adapter-chain $DESTINATION_RPC

```

#### Flags

##### Bridge flags: --ccip , --lz, --vea. <br>

Deploys Adapter and Reporter contracts for passed bridges.

```shell
$ ./script/deploy-route.sh --reporter-chain $SOURCE_RPC --adapter-chain $DESTINATION_RPC --lz --vea
```

**⚠️ Before deploying LayerZero contracts update the DVN addresses in Adapter and Reporter scripts.**

##### Hashi flag: --hashi

Deploys Yaho, Yaru and Hashi contract.

```shell
$ ./script/deploy-route.sh --reporter-chain $SOURCE_RPC --adapter-chain $DESTINATION_RPC --hashi
```

##### Lightbulb flag: --lightbulb

Deploys Switch and Lightbulb contract.

```shell
$ ./script/deploy-route.sh --reporter-chain $SOURCE_RPC --adapter-chain $DESTINATION_RPC --lightbulb
```

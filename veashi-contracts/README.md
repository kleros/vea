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

### Prepare a verified `.env` for a route

`script/prepare-env` fills `.env.example` for one route and verifies every address before publishing it:

```shell
$ export REPORTER_RPC=https://x.io ADAPTER_RPC=https://y.io   # read-only; or put them in .env
$ yarn prepare-env --source 42161 --target 1514 --bridges lz,ccip,debridge [--vea-network testnet] [--apply]
```

It asks Claude Code (your normal login, print mode, JSON schema, hard timeout) for the addresses with citations, then
independently re-resolves each value from `contracts/deployments`, `broadcast/<src>-<dst>.json` and the official
registries pinned in `script/prepare-env/registries.json` (LayerZero metadata API, Chainlink chain-selectors and CCIP
directory, Axelar deployments), and checks chain id, bytecode and identity getters (`eid()`, `typeAndVersion()`,
`isChainSupported()`, `contractId()`, `getChainId()`, Yaru/Vea links) over RPC. Only when every check passes it writes
`deploy-config/<src>-<dst>.env` (sources as comments) and `deploy-config/<src>-<dst>.report.json` atomically;
`--apply` also copies the env to `.env`. Failures leave previous output untouched, write
`<src>-<dst>.failed.report.json` and exit 2 (agent) or 3 (verification). The agent reads a per-route extract of the
registries written by the tool (the full LayerZero metadata is too large for its fetch tool) and cites the registry
URLs. deBridge publishes chain ids through its supported-chains API but no gate registry, so gate addresses are verified
on-chain plus a docs citation only; the report states the verification level per key.
`DEPLOYER_KEY` is always left blank; fees, `HEADER_STORAGE` and the DVNs hardcoded in `script/layerZero` are not verified.
Tests: `yarn test:prepare-env`.

### Deploy

Copy `.env.example` to `.env` and fill in the required values (or generate it with `prepare-env` above).

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

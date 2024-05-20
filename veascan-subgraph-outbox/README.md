# VeaScan Outbox Subgraph

## Deployments

### Sepolia (hosted service)

- [Subgraph explorer](https://thegraph.com/studio/subgraph/veascan-outbox-arb-sep-devnet/)
- [Subgraph endpoints](https://api.studio.thegraph.com/query/67213/veascan-outbox-arb-sep-devnet/version/latest)

## Chiado (GoldSky)

- [Subgraph endpoint](https://api.goldsky.com/api/public/project_clh3hizxpga0j49w059761yga/subgraphs/kleros-veascan-outbox-chiado/latest/gn)

## Build

```bash
$ yarn

$ yarn codegen

$ yarn build
```

## Switching between deployments

This script updates `subgraph.yml` by parsing the deployment artifacts in `../contracts/deployments`.

```bash
yarn update:sepolia

yarn update:chiado
```

## Deployment to The Graph (hosted service)

### Authentication

Get an API key from the TheGraph.com, then authenticate.

```bash
$ yarn run graph auth --product hosted-service
```

### Deployment

```bash
yarn deploy:sepolia
```

## Deployment to Chiado via GoldSky

### Authentication

Obtain an API key (paid service) or ask a project maintainer to run the deployment Github Action.

```bash
$ yarn run goldsky login
```

### Deployment

```bash
yarn deploy:chiado
```

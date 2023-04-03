# VeaScan Outbox Subgraph

## Deployments

### Goerli (hosted service)

- [Subgraph explorer](https://thegraph.com/explorer/subgraph/kleros/veascan-outbox-goerli)
- [Subgraph endpoints](https://api.thegraph.com/subgraphs/name/kleros/veascan-outbox-goerli)

## Build

```bash
$ yarn

$ yarn codegen

$ yarn build
```

## Deployment to The Graph (hosted service)

### Authentication

Get an API key from the TheGraph.com, then authenticate.

```bash
$ yarn run graph auth --product hosted-service
```

### Deployment

```bash
yarn deploy
```

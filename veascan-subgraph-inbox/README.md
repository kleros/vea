# VeaScan Inbox Subgraph

## Deployments

### Arbitrum Sepolia (hosted service)

- [Subgraph explorer](https://thegraph.com/explorer/subgraph/kleros/veascan-inbox-arbitrumsepolia)
- [Subgraph endpoints](https://api.thegraph.com/subgraphs/name/kleros/veascan-inbox-arbitrumsepolia)

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

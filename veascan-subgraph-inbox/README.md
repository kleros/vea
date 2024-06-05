# VeaScan Inbox Subgraph

## Deployments

### Arbitrum Sepolia (hosted service)

- [Subgraph explorer](https://thegraph.com/studio/subgraph/veascan-inbox-arb-sep-devnet/)
- [Subgraph endpoints](https://api.studio.thegraph.com/query/67213/veascan-inbox-arb-sep-devnet/version/latest)

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

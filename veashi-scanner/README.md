# Veashi Scanner — Cross-Chain Message Explorer

A cross-chain message explorer for the [Hashi](https://github.com/gnosis/hashi) protocol, built on the
[`@kleros/veashi-sdk`](../). It lets you browse messages dispatched through Hashi's `Yaho` contract and
inspect each message's bridge confirmations, threshold progress, and execution status across multiple bridge
providers.

A message is considered verified once enough independent bridge adapters have relayed and stored its hash on
the destination chain to meet the message's required threshold.

## Supported routes & bridges

Routes and bridge deployments come from the SDK (`getRoute` / `getAvailableBridges`). Currently supported:

| Source chain              | Destination chain     | Bridges              |
| ------------------------- | --------------------- | -------------------- |
| Story (1514)              | Arbitrum One (42161)  | LayerZero, DeBridge  |
| Arbitrum One (42161)      | Story (1514)          | LayerZero, DeBridge  |
| Arbitrum Sepolia (421614) | Sepolia (11155111)    | LayerZero, CCIP, Vea |
| Arbitrum Sepolia (421614) | Gnosis Chiado (10200) | CCIP, Vea            |

**Bridge providers:** LayerZero, Chainlink CCIP, [Vea](https://github.com/kleros/vea), and deBridge.

> The route table is driven entirely by the installed `@kleros/veashi-sdk` version. As new routes are
> deployed and the SDK is bumped, they appear automatically — no scanner changes needed.

## Running locally

This package lives in the `vea` monorepo as the `@kleros/veashi-scanner` Yarn workspace.

### Prerequisites

- Node.js 18+ and Yarn 4 (the repo pins `yarn@4.6.0` via `packageManager`).
- A running [Envio indexer](../veashi-envio-yaho) exposing a GraphQL endpoint (optional — the scanner falls
  back to direct RPC reads, but the message list is populated from the indexer).

### Steps

```bash
# From the monorepo root (installs all workspaces)
yarn install

# Start the scanner dev server
yarn workspace @kleros/veashi-scanner dev
# …or from within veashi-scanner/
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

Create `veashi-scanner/.env.local` (defaults shown are used when unset):

| Variable                          | Default                            | Description                                     |
| --------------------------------- | ---------------------------------- | ----------------------------------------------- |
| `NEXT_PUBLIC_ENVIO_URL`           | `http://localhost:8080/v1/graphql` | Envio indexer GraphQL endpoint.                 |
| `NEXT_PUBLIC_HASURA_ADMIN_SECRET` | `testing`                          | Hasura admin secret sent with indexer requests. |

RPC access uses viem's default public transport per chain; no RPC keys are required for the supported
testnets, though you can configure custom transports in [`lib/chains.ts`](lib/chains.ts) if you hit rate limits.

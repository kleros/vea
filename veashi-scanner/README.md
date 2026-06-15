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

Open [http://localhost:5173](http://localhost:5173).

### Environment variables

Create `veashi-scanner/.env.local` (the default below is used when unset):

| Variable         | Default                            | Description                     |
| ---------------- | ---------------------------------- | ------------------------------- |
| `VITE_ENVIO_URL` | `http://localhost:8080/v1/graphql` | Envio indexer GraphQL endpoint. |

The Envio query endpoint (local and Envio Cloud) is public and read-only, so no Hasura admin secret is
required — none is sent from the client. RPC access uses viem's default public transport per chain; no RPC
keys are required for the supported testnets, though you can configure custom transports in
[`lib/chains.ts`](lib/chains.ts) if you hit rate limits.

## Tech stack

- **Vite** + **React 18** (single-page app) — client-rendered; all data is fetched in the browser.
- **react-router** for routing (`/` and `/tx/{sourceChainId}/{txHash}`).
- **TypeScript**, **Tailwind CSS v4** (via `@tailwindcss/vite`).
- **viem** for on-chain reads, **[@kleros/veashi-sdk](../)** for routes/addresses/ABIs, and
  **[@kleros/ui-components-library](https://github.com/kleros/ui-components-library)** for UI.

## Scripts

| Command        | Description                                 |
| -------------- | ------------------------------------------- |
| `yarn dev`     | Start the Vite dev server on port 5173.     |
| `yarn build`   | Type-check (`tsc -b`) and build to `dist/`. |
| `yarn preview` | Serve the production build locally.         |
| `yarn lint`    | Run ESLint.                                 |

## Deploying

The build output in `dist/` is a static SPA. Because routing is client-side, configure your host to rewrite
all paths to `index.html` so deep links like `/tx/1514/0x…` resolve on refresh. Set `VITE_ENVIO_URL` to your
Envio Cloud endpoint in the host's environment.

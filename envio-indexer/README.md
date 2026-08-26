# envio-indexer

HyperIndex (Envio) indexer covering Vea's inbox/outbox bridge contracts and Veashi's Yaho (Hashi) cross-chain messaging contract, merged into a single indexer with one `config.yaml` and one `schema.graphql`.

_Please refer to the [documentation website](https://docs.envio.dev) for a thorough guide on all [Envio](https://envio.dev) indexer features._

## Contracts and chains

| Contract           | Events                                                                       | Chain            | Chain ID | Start block |
| ------------------ | ---------------------------------------------------------------------------- | ---------------- | -------- | ----------- |
| `VeaInboxArbToEth` | `MessageSent`, `SnapshotSaved`, `SnapshotSent`                               | Arbitrum Sepolia | 421614   | 92669889    |
| `VeaOutbox`        | `Claimed`, `Challenged`, `VerificationStarted`, `Verified`, `MessageRelayed` | Sepolia          | 11155111 | 9100938     |
| `VeaOutbox`        | `Claimed`, `Challenged`, `VerificationStarted`, `Verified`, `MessageRelayed` | Chiado           | 10200    | 17544965    |
| `Yaho`             | `MessageDispatched`                                                          | Story Protocol   | 1514     | 12699901    |
| `Yaho`             | `MessageDispatched`                                                          | Arbitrum One     | 42161    | 427763138   |
| `Yaho`             | `MessageDispatched`                                                          | Arbitrum Sepolia | 421614   | 92669889    |

Chain 421614 (Arbitrum Sepolia) carries both `VeaInboxArbToEth` and `Yaho` — its `start_block` is the earlier of the two contracts' individual start blocks so neither is skipped.

## Indexed entities

- **Inbox-facing:** `Inbox`, `Sender`, `Receiver`, `MerkleNode`, `MessageSent`, `SnapshotSaved`, `Snapshot`, `Message`, `Fallback`, `Ref`
- **Outbox-facing:** `Outbox`, `Claim`, `Challenge`, `Verification`, `MessageExecution`, `CurrentClaim`
- **Yaho-facing:** `MessageDispatched`

Note: `MessageExecution` is the outbox's message-relay record. It was renamed from this package's original source name (`Message` in `vea-envio-outbox`) to avoid colliding with the unrelated, differently-shaped `Message` entity from `vea-envio-inbox` (the validator/explorer-facing record with `from`/`to`/`snapshot`/`data`), since both now live in one schema.

## Setup

Install dependencies from the repo root:

```bash
yarn install
```

**Before running `build`, `test`, or `dev` for the first time (or after editing `config.yaml`/`schema.graphql`), generate the Envio types:**

```bash
yarn codegen
```

This writes `.envio/types.d.ts`, which `envio-env.d.ts` references and which the whole package depends on to type-check. It's gitignored, so every fresh clone needs this step once before anything else will build.

## Development

```bash
yarn dev
```

Visit http://localhost:8080 to see the GraphQL Playground, local password is `testing`.

## Build

```bash
yarn build
```

## Test

```bash
yarn test
```

Tests use the `createTestIndexer` API from `envio` to simulate events in-process without a running node or database. When running jest directly rather than via `yarn test`, set `NODE_OPTIONS=--experimental-vm-modules` (the `test` script already sets this).

## Pre-requisites

- [Node.js](https://nodejs.org/en/download/current)
- [Yarn](https://classic.yarnpkg.com/en/docs/install)
- [Docker desktop](https://www.docker.com/products/docker-desktop/)

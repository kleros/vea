# envio-indexer

HyperIndex (Envio) indexer covering Vea's inbox/outbox bridge contracts and Veashi's Yaho (Hashi) cross-chain messaging contract, merged into a single indexer with one `config.yaml` and one `schema.graphql`.

_Please refer to the [documentation website](https://docs.envio.dev) for a thorough guide on all [Envio](https://envio.dev) indexer features._

## Contracts and chains

Vea contracts:

| Contract           | Events                                                                       | Chain            | Chain ID | Start block |
| ------------------ | ---------------------------------------------------------------------------- | ---------------- | -------- | ----------- |
| `VeaInboxArbToEth` | `MessageSent`, `SnapshotSaved`, `SnapshotSent`                               | Arbitrum Sepolia | 421614   | 189388217   |
| `VeaOutbox`        | `Claimed`, `Challenged`, `VerificationStarted`, `Verified`, `MessageRelayed` | Sepolia          | 11155111 | 9100938     |
| `VeaOutbox`        | `Claimed`, `Challenged`, `VerificationStarted`, `Verified`, `MessageRelayed` | Chiado           | 10200    | 17544965    |

Veashi `Yaho` (`MessageDispatched`), one deployment per source chain per route. Addresses are synced from `veashi-sdk/addresses/<src>-<dst>.json`:

| Chain            | Chain ID | Yaho address                                 | Routes                                      | Start block |
| ---------------- | -------- | -------------------------------------------- | ------------------------------------------- | ----------- |
| Arbitrum Sepolia | 421614   | `0xDbdF80c87f414fac8342e04D870764197bD3bAC7` | 421614-11155111, 421614-10200, 421614-84532 | 92669889    |
| Sepolia          | 11155111 | `0xb286025885808F2A2D42cd9e2204D007f52b135e` | 11155111-84532                              | 11115803    |
| Sepolia          | 11155111 | `0xc7adf4dED023475f1b601E39444634DF4Ca62905` | 11155111-5042002                            | 11666202    |
| Base Sepolia     | 84532    | `0xcfD14674659bB15D0304a3608239a46A14d77554` | 84532-11155111                              | 43182223    |
| Base Sepolia     | 84532    | `0xf69BCD5Ff8A64919BE217bC017454aba4f6daa9D` | 84532-421614                                | 43265524    |
| Arc Testnet      | 5042002  | `0x644Be3a596F082CC36D0bD929ABe855180536ac3` | 5042002-11155111                            | 60881780    |
| Ethereum         | 1        | `0x47F3Ba12550dFA097c77A10eB6472a881Ea5AA0e` | 1-8453                                      | 25373011    |
| Ethereum         | 1        | `0xA6243C9DDf54de341De4D30F6955bdF50dE8e488` | 1-4663                                      | 25870527    |
| Ethereum         | 1        | `0x44d3d3d8cB731958Df78DAf531b16E23DfB27450` | 1-4217                                      | 25888168    |
| Ethereum         | 1        | `0x969AB2aC35EC63AB70C70e5ab604Cf48e8367A95` | 1-5042                                      | 26003178    |
| Arbitrum One     | 42161    | `0xD0375320591ff87797CEb03CBeE80C82fD61BC77` | 42161-1514, 42161-8453                      | 427763138   |
| Arbitrum One     | 42161    | `0xd578fa969579CB7b560446D486C8451cd454C8cd` | 42161-4663                                  | 500069401   |
| Arbitrum One     | 42161    | `0x8d0FEC421618dD7c82fB3009DB3f27d87F8026df` | 42161-4217                                  | 500953080   |
| Base             | 8453     | `0x88fAa01842E32beA05b167C679443009c3891183` | 8453-1, 8453-42161                          | 47621992    |
| Story            | 1514     | `0x0313f25f51f8846fdDFaBCb7F0672e4D3E1C0E76` | 1514-42161                                  | 12699901    |
| Tempo            | 4217     | `0x3e71215c32095fd32c458E683D557709c3cef2f9` | 4217-1                                      | 37616896    |
| Tempo            | 4217     | `0xC814209b3814165d70B1A21Fa417D7aad67a7bc0` | 4217-42161                                  | 37639518    |
| Robinhood Chain  | 4663     | `0x644Be3a596F082CC36D0bD929ABe855180536ac3` | 4663-42161                                  | 50257797    |
| Robinhood Chain  | 4663     | `0x7AA0c9376178EBC081eAd5C49801C86Ce834D629` | 4663-1                                      | 50287261    |
| Arc              | 5042     | `0xd231B305F050aAeA434B8c7339D03cd7483d5610` | 5042-42161                                  | 21463879    |
| Arc              | 5042     | `0x12E24D73f0386ACf281fb5d1502fF159df7616Ff` | 5042-1                                      | 21468436    |

Each chain's `start_block` in `config.yaml` is the earliest deployment on that chain; where a chain carries contracts deployed at different times (Arbitrum Sepolia, Sepolia), the later contract sets its own `start_block` so nothing is scanned before it exists. Start blocks are the contracts' creation blocks, verified on-chain.

Every chain above is served by HyperSync except Story (1514), which uses its public RPC as the primary sync source.

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

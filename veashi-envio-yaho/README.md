# veashi-envio-yaho

HyperIndex (Envio) indexer for the Yaho contract, tracking `MessageDispatched` events across Story Protocol, Arbitrum One, and Arbitrum Sepolia.

## Chains

| Chain            | ID     | Address                                      |
| ---------------- | ------ | -------------------------------------------- |
| Story Protocol   | 1514   | `0x0313f25f51f8846fdDFaBCb7F0672e4D3E1C0E76` |
| Arbitrum One     | 42161  | `0xD0375320591ff87797CEb03CBeE80C82fD61BC77` |
| Arbitrum Sepolia | 421614 | `0xDbdF80c87f414fac8342e04D870764197bD3bAC7` |

## Indexed entity

`MessageDispatched` — one record per dispatched message.

| Field            | Type     | Description                          |
| ---------------- | -------- | ------------------------------------ |
| `id`             | `String` | `{chainId}_{blockNumber}_{logIndex}` |
| `messageId`      | `String` | On-chain message ID                  |
| `sourceChainId`  | `BigInt` | Chain the message was sent from      |
| `yaho`           | `String` | Yaho contract address                |
| `nonce`          | `BigInt` | Message nonce                        |
| `targetChainId`  | `BigInt` | Destination chain ID                 |
| `threshold`      | `BigInt` | Adapter threshold required           |
| `sender`         | `String` | Sender address                       |
| `receiver`       | `String` | Receiver address                     |
| `data`           | `String` | Encoded message data                 |
| `reporters`      | `String` | JSON array of reporter addresses     |
| `adapters`       | `String` | JSON array of adapter addresses      |
| `blockNumber`    | `BigInt` | Block number of the event            |
| `blockTimestamp` | `BigInt` | Block timestamp of the event         |

## Setup

Install dependencies from the repo root:

```bash
yarn install
```

Regenerate types after editing `config.yaml` or `schema.graphql`:

```bash
yarn codegen
```

## Development

```bash
# Start the local indexer with hot reload
yarn dev
```

## Build

```bash
yarn build
```

## Test

```bash
yarn test
```

Tests use the `createTestIndexer` API from `envio` to simulate events in-process without a running node or database.

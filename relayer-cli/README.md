# Vea Relayer Bot

Relays messages from VeaInbox contracts on source chains to VeaOutbox contracts on destination chains. Supports both standard Vea relay and Hashi-based message execution.

## How it works

Each configured chain runs in a loop:

1. **Standard relay** — reads the latest snapshot root from the subgraph, batches unrelayed messages, and submits them via `TransactionBatcher`.
2. **Hashi executor** — scans `MessageDispatched` logs on the source chain, checks threshold via the Hashi contract, and executes eligible messages on the target chain via the Yaru contract.

Hashi pairs are configured separately (see `HASHI_CHAINS` below).

## Environment variables

### Required

| Variable                               | Description                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `PRIVATE_KEY`                          | Wallet private key used to sign relay transactions                              |
| `ENVIO_URL`                            | GraphQL endpoint of the merged Envio indexer (envio-indexer)                    |
| `STATE_DIR`                            | Absolute path to the directory where state files are stored (must end with `/`) |
| `TRANSACTION_BATCHER_CONTRACT_SEPOLIA` | TransactionBatcher address on Sepolia                                           |
| `TRANSACTION_BATCHER_CONTRACT_CHIADO`  | TransactionBatcher address on Chiado                                            |
| `RPC_SEPOLIA`                          | Comma-separated RPC URL(s) for Sepolia                                          |
| `RPC_CHIADO`                           | Comma-separated RPC URL(s) for Chiado                                           |
| `RPC_ARBITRUM_SEPOLIA`                 | Comma-separated RPC URL(s) for Arbitrum Sepolia                                 |

### Chain selection

| Variable       | Description                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| `VEA_CHAINS`   | Comma-separated `sourceChainId-targetChainId` pairs to relay messages on (e.g. `421614-11155111,421614-10200`) |
| `HASHI_CHAINS` | Comma-separated `sourceChainId-targetChainId` pairs for Hashi execution (e.g. `421614-11155111,421614-10200`)  |

### Sender filtering

Each network type is enabled by setting its sender list. Use `0x0000000000000000000000000000000000000000` (zero address) to relay for all senders. Leave unset to disable that network.

| Variable                   | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| `SENDER_ADDRESSES_DEVNET`  | Comma-separated sender addresses for devnet          |
| `SENDER_ADDRESSES_TESTNET` | Comma-separated sender addresses for testnet         |
| `SENDER_ADDRESSES_HASHI`   | Comma-separated sender addresses for Hashi execution |

### Optional

| Variable        | Description                                             |
| --------------- | ------------------------------------------------------- |
| `HEARTBEAT_URL` | URL to ping on start, each cycle, and on stop           |
| `LOCAL_DEPLOY`  | Set to `true` to enable pino-pretty coloured log output |

## Running locally

Generate contract types(from root):

```bash
yarn install
cd contracts
yarn build
```

Run relayer:

```bash
cp .env.dist .env      # fill in your values
yarn start-relayer
```

## Docker

Create the env file first — both compose files declare it as required, so they
fail immediately without it. From the repo root:

```bash
cp relayer-cli/.env.dist relayer-cli/.env
```

Run the image published to GHCR (from the repo root):

```bash
docker compose up relayer
```

Or build it from this working tree instead:

```bash
docker compose -f docker-compose.build.yml build relayer
docker compose -f docker-compose.build.yml up relayer
```

Both compose files set `STATE_DIR` to the in-container state directory and
persist it in the `relayer-state` volume; the `STATE_DIR` value in `.env` is
used only when running the relayer outside Docker.

## Tests

Generate contract types before running tests if not generated :

```bash
yarn test                          # all tests
yarn test src/utils/relay.test.ts  # specific file
yarn test --coverage               # with coverage report
```

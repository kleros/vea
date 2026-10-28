# @kleros/veashi-sdk

SDK for the **Veashi** cross-chain messaging. Bundles core smart contracts, TypeChain types, and UI utility functions.

---

## 📦 Features

- **Contract Artifacts**: Solidity sources and ABIs for `Hashi`, and bridge adapters.
- **TypeChain Types**: Ethers v6 TypeScript support for type-safe interactions.
- **UI Helpers**: Metadata utilities for chain discovery and address resolution.
- **Bridge Support**: Native integration for **CCIP**, **Vea**, **LayerZero**.

---

## 📦 Installation

Install the package using Yarn 4+:

```bash
yarn add @kleros/veashi-sdk
```

---

### 🏗 Import Structure

#### TypeChain && Utils

```typescript
import { Yaho__factory, Yaru__factory, VeaReporter__factory, getAllSourceChains } from "@kleros/veashi-sdk";
```

#### Contracts

To import the Solidity source files or interfaces directly into your own smart contracts:

```solidity
// Core Protocol
import "@kleros/veashi-sdk/contracts/Yaho.sol";
import "@kleros/veashi-sdk/contracts/Yaru.sol";

// Interfaces
import "@kleros/veashi-sdk/contracts/interfaces/IYaho.sol";
import "@kleros/veashi-sdk/contracts/interfaces/IYaru.sol";

// Bridge Reporters
import "@kleros/veashi-sdk/contracts/adapters/vea/VeaReporter.sol";
import "@kleros/veashi-sdk/contracts/adapters/layerZero/LayerZeroReporter.sol";
```

---

## 🌉 Vea Addresses (testnet only)

The SDK also exposes Vea's own contracts per route: the `VeaInbox` on the source chain, the `VeaOutbox` on the destination chain and, on routes that have one, the `Router` in between. **Only testnet deployments are included**; mainnet and Devnet Vea addresses are not.

```typescript
import { getVeaInbox, getVeaOutbox, getVeaRouter, getVeaRoute, getVeaRoutes } from "@kleros/veashi-sdk";

getVeaInbox(421614, 11155111); // VeaInboxArbToEthTestnet on Arbitrum Sepolia
getVeaOutbox(421614, 11155111); // VeaOutboxArbToEthTestnet on Sepolia
getVeaRouter(421614, 10200); // RouterArbToGnosisTestnet on Sepolia
getVeaRoute(421614, 10200); // { inbox, outbox, router }
getVeaRoutes(); // ["421614-10200", "421614-11155111"]
```

Each getter takes `(sourceChainId, destinationChainId)` and returns a `0x${string}` address, or `undefined` when the route has no testnet Vea deployment (for example `10200-421614`, which only has Devnet contracts). `getVeaRoute` returns `{ inbox, outbox, router? }` as plain addresses.

| Route                      | Key               | Router                                |
| -------------------------- | ----------------- | ------------------------------------- |
| Arbitrum Sepolia → Sepolia | `421614-11155111` | none                                  |
| Arbitrum Sepolia → Chiado  | `421614-10200`    | `RouterArbToGnosisTestnet` on Sepolia |

Arbitrum → Gnosis routes (`ArbToGnosis`) need a router on Ethereum, which relays the snapshot from Arbitrum to Gnosis. Arbitrum → Ethereum routes do not.

### JSON data (for non-JS consumers)

The addresses live in a single JSON file, the same one the getters read. It is committed at `veashi-sdk/vea/testnet.json` in the repository and published in the npm package as `@kleros/veashi-sdk/vea/testnet.json` (`dist/vea/testnet.json` inside the tarball). Python, Rust and other projects can read it directly.

The file maps `"<sourceChainId>-<destinationChainId>"` to an entry with `inbox`, `outbox` and, only on routes that need one, `router`. Each of these records the deployment it came from:

```json
{
  "421614-10200": {
    "inbox": {
      "address": "0x162f826E18380567CE0548395a3Ad2A54EA87B96",
      "contract": "VeaInboxArbToGnosisTestnet",
      "network": "arbitrumSepolia"
    },
    "outbox": { "address": "0x…", "contract": "VeaOutboxArbToGnosisTestnet", "network": "chiado" },
    "router": { "address": "0x…", "contract": "RouterArbToGnosisTestnet", "network": "sepolia" }
  }
}
```

- `address`: the checksummed address from the deployment file.
- `contract`: the hardhat-deploy deployment name in `contracts/deployments/<network>/`.
- `network`: the hardhat-deploy network (`arbitrumSepolia` = 421614, `sepolia` = 11155111, `chiado` = 10200).

The file carries addresses only, no ABIs; use `@kleros/vea-contracts` for those. A route is listed only when both its testnet inbox and outbox exist.

### Regenerating

The file is generated from `contracts/deployments`; never edit it by hand. It needs no forge build:

```bash
yarn workspace @kleros/veashi-sdk extract:vea
```

`yarn extract` runs it after `generate-types.sh`. The generator (`scripts/extract-vea.cjs`) reads `*Testnet` deployments only, checks each network's `.chainId`, and fails if a route that needs a router has none. Routes that need a router are listed in `ROUTES_WITH_ROUTER` in the generator.

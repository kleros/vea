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

## 🚀 Releasing

Bump `version` in `veashi-sdk/package.json` and merge it to `dev`. The `Publish Veashi SDK` workflow (`.github/workflows/publish-veashi-sdk.yml`) builds and packs the package, waits for approval in the `npm-publish` environment, then publishes it to npm with trusted publishing. A version that is already on npm publishes nothing.

`yarn build` uses the committed `contracts/` and `abi/`, so the package describes the deployed contracts. It only regenerates the TypeChain types, `addresses/` (from `veashi-contracts/broadcast`) and `registry.ts`. Commit any change it makes before you release.

To ship newer contracts together with their redeployment, run `forge build` in `veashi-contracts`, then `yarn extract:contracts` in `veashi-sdk`. Review the diff to `contracts/` and `abi/`, and bump the minor version.

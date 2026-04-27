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

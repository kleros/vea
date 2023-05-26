# Vea SDK <a href="https://www.npmjs.com/package/@kleros/vea-sdk"><img alt="npm" src="https://img.shields.io/npm/v/@kleros/vea-sdk?color=lightgrey"></a>

This package facilitates the interactions with the Vea protocol.

## Getting Started

```bash
yarn add @kleros/vea-sdk
# or
npm install @kleros/vea-sdk
```

## Example

```typescript
import { Wallet } from "@ethersproject/wallet";
import VeaSdk from "../src/index";
import envVar from "../src/utils/envVar";

// Create the Vea client
const vea = VeaSdk.ClientFactory.arbitrumGoerliToChiadoDevnet(envVar("RPC_ARB_GOERLI"), envVar("RPC_CHIADO"));

// Get the message info
const messageId = 42;
const messageInfo = await vea.getMessageInfo(messageId);

// Relay the message
const privateKey = envVar("PRIVATE_KEY");
const wallet = new Wallet(privateKey, vea.outboxProvider);
await vea.relay(messageInfo, wallet);
```

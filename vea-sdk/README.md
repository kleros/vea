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

// Create the Vea client
const vea = VeaSdk.ClientFactory.arbitrumGoerliToChiadoDevnet(
  "https://rpc.goerli.eth.gateway.fm",
  "https://rpc.chiado.gnosis.gateway.fm"
);

// Get the message info
const messageId = 42;
const messageInfo = await vea.getMessageInfo(messageId);

// Relay the message
const privateKey = process.env["PRIVATE_KEY"] ?? "";
const wallet = new Wallet(privateKey, vea.outboxProvider);
await vea.relay(messageInfo, wallet);
```

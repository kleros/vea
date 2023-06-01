import { JsonRpcProvider } from "@ethersproject/providers";
import * as Bridges from "./bridges";
import { VeaClient, VeaClientConfig } from "./client";

export class ClientFactory {
  private static configure(bridge: Bridges.Bridge, inboxRpc: string, outboxRpc: string): VeaClient {
    const config: VeaClientConfig = {
      bridge,
      inboxRpc: inboxRpc,
      outboxRpc: outboxRpc,
    };
    const inboxProvider = new JsonRpcProvider(inboxRpc);
    const outboxProvider = new JsonRpcProvider(outboxRpc);
    const veaInbox = Object.getPrototypeOf(bridge.inboxFactory).constructor.connect(bridge.inboxAddress, inboxProvider);
    const veaOutbox = Object.getPrototypeOf(bridge.outboxFactory).constructor.connect(
      bridge.outboxAddress,
      outboxProvider
    );
    inboxProvider.getNetwork().then((network) => {
      if (network.chainId !== bridge.inboxChainId) throw new Error("Incorrect Inbox RPC");
    });
    outboxProvider.getNetwork().then((network) => {
      if (network.chainId !== bridge.outboxChainId) throw new Error("Incorrect Outbox RPC");
    });
    return new VeaClient(config, inboxProvider, outboxProvider, veaInbox, veaOutbox);
  }

  static arbitrumGoerliToChiadoDevnet(inboxRpc: string, outboxRpc: string): VeaClient {
    return this.configure(Bridges.arbitrumGoerliToChiadoDevnet, inboxRpc, outboxRpc);
  }

  static arbitrumGoerliToGoerliDevnet(inboxRpc: string, outboxRpc: string): VeaClient {
    return this.configure(Bridges.arbitrumGoerliToGoerliDevnet, inboxRpc, outboxRpc);
  }
}

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
    const veaInbox = bridge.inboxFactory.connect(bridge.inboxAddress, inboxProvider);
    const veaOutbox = bridge.outboxFactory.connect(bridge.outboxAddress, outboxProvider);
    // TODO: Check if the RPCs chainIds match the bridge chainIds
    return new VeaClient(config, inboxProvider, outboxProvider, veaInbox, veaOutbox);
  }

  static arbitrumGoerliToChiadoDevnet(inboxRpc: string, outboxRpc: string): VeaClient {
    return this.configure(Bridges.arbitrumGoerliToChiadoDevnet, inboxRpc, outboxRpc);
  }

  static arbitrumGoerliToGoerliDevnet(inboxRpc: string, outboxRpc: string): VeaClient {
    return this.configure(Bridges.arbitrumGoerliToGoerliDevnet, inboxRpc, outboxRpc);
  }
}

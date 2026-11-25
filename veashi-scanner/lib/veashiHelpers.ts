import { Bridges, getAvailableBridges, getBridgeAddresses } from "@kleros/veashi-sdk";

/** Curated display label for the bridges we know about. Anything else falls back to a capitalized raw name. */
const BRIDGE_LABELS: Partial<Record<Bridges, string>> = {
  [Bridges.CCIP]: "CCIP",
  [Bridges.LZ]: "LayerZero",
  [Bridges.VEA]: "Vea",
  [Bridges.DEBRIDGE]: "DeBridge",
};

/** Convert a `Bridges` enum value to a display label, e.g. for a newly-deployed bridge the SDK added. */
export function getBridgeLabel(bridge: Bridges): string {
  return BRIDGE_LABELS[bridge] ?? bridge.charAt(0).toUpperCase() + bridge.slice(1);
}

/**
 * Identifies the bridge network for a given adapter and/or reporter address.
 * Checks every bridge the SDK reports as available for this route, so a newly
 * deployed bridge (e.g. a fresh SDK release adding one) is recognized with no
 * changes needed here.
 */
export function getBridgeName(
  sourceChainId: number,
  destinationChainId: number,
  adapterAddress?: string,
  reporterAddress?: string
): Bridges | null {
  const isMatch = (addr1?: string, addr2?: string) => !!addr1 && !!addr2 && addr1.toLowerCase() === addr2.toLowerCase();

  for (const bridge of getAvailableBridges(sourceChainId, destinationChainId)) {
    const addresses = getBridgeAddresses(sourceChainId, destinationChainId, bridge);
    if (!addresses) continue;
    if (isMatch(adapterAddress, addresses.adapter) || isMatch(reporterAddress, addresses.reporter)) {
      return bridge;
    }
  }

  return null;
}

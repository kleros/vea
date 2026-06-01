import { Bridges, getRoute } from "@kleros/veashi-sdk";

/**
 * Identifies the bridge network for a given adapter and/or reporter address.
 * Uses the veashi SDK's getRoute to compare against known route deployments.
 */
export function getBridgeName(
  sourceChainId: number,
  destinationChainId: number,
  adapterAddress?: string,
  reporterAddress?: string
): Bridges | null {
  const route = getRoute(sourceChainId, destinationChainId);

  // If there's no route deployed between these chains, we can't identify it
  if (!route) return null;

  // Helper function for safe, case-insensitive address comparison
  const isMatch = (addr1?: string, addr2?: string) => {
    if (!addr1 || !addr2) return false;
    return addr1.toLowerCase() === addr2.toLowerCase();
  };

  // Check CCIP
  if (isMatch(adapterAddress, route.ccipAdapter) || isMatch(reporterAddress, route.ccipReporter)) {
    return Bridges.CCIP;
  }

  // Check LayerZero (LZ)
  if (isMatch(adapterAddress, route.lzAdapter) || isMatch(reporterAddress, route.lzReporter)) {
    return Bridges.LZ;
  }

  // Check Vea
  if (isMatch(adapterAddress, route.veaAdapter) || isMatch(reporterAddress, route.veaReporter)) {
    return Bridges.VEA;
  }

  return null;
}

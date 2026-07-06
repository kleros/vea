import { Bridges, getRoute } from "@kleros/veashi-sdk";
import type { Bridge } from "./types";

/**
 * Maps the SDK's `Bridges` enum values (lowercase: "ccip", "lz", "vea",
 * "deBridge") to the display `Bridge` type literals used across the UI.
 */
const BRIDGE_LABELS: Record<Bridges, Bridge> = {
  [Bridges.CCIP]: "CCIP",
  [Bridges.LZ]: "LayerZero",
  [Bridges.VEA]: "Vea",
  [Bridges.DEBRIDGE]: "DeBridge",
};

/** Convert a `Bridges` enum value to its UI `Bridge` label. */
export function getBridgeLabel(bridge: Bridges): Bridge {
  return BRIDGE_LABELS[bridge];
}

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

  // Check DeBridge. The SDK's route type omits these fields even though the
  // route data includes them, so we access them through a narrow cast.
  const deBridgeRoute = route as typeof route & { deBridgeAdapter?: string; deBridgeReporter?: string };
  if (
    isMatch(adapterAddress, deBridgeRoute.deBridgeAdapter) ||
    isMatch(reporterAddress, deBridgeRoute.deBridgeReporter)
  ) {
    return Bridges.DEBRIDGE;
  }

  return null;
}

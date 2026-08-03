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

/** Curated badge colors for the bridges we know about. */
const KNOWN_BRIDGE_COLORS: Partial<Record<Bridges, { bg: string; text: string; border: string }>> = {
  [Bridges.CCIP]: { bg: "rgba(55, 115, 255, 0.1)", text: "#3773FF", border: "rgba(55, 115, 255, 0.3)" },
  [Bridges.LZ]: { bg: "rgba(255, 255, 255, 0.08)", text: "#FFFFFF", border: "rgba(255, 255, 255, 0.2)" },
  [Bridges.VEA]: { bg: "rgba(236, 72, 153, 0.1)", text: "#EC4899", border: "rgba(236, 72, 153, 0.3)" },
  [Bridges.DEBRIDGE]: { bg: "rgba(103, 230, 220, 0.1)", text: "#67E6DC", border: "rgba(103, 230, 220, 0.3)" },
};

/**
 * Fallback palette for bridges without a curated color, e.g. a new deployment.
 * A fixed set of hand-picked, high-contrast colors — rather than a continuous
 * hash-to-hue range — so every fallback is guaranteed legible on a dark background.
 */
const FALLBACK_BRIDGE_PALETTE: { bg: string; text: string; border: string }[] = [
  { bg: "rgba(245, 158, 11, 0.1)", text: "#F59E0B", border: "rgba(245, 158, 11, 0.3)" }, // amber
  { bg: "rgba(132, 204, 22, 0.1)", text: "#84CC16", border: "rgba(132, 204, 22, 0.3)" }, // lime
  { bg: "rgba(251, 113, 133, 0.1)", text: "#FB7185", border: "rgba(251, 113, 133, 0.3)" }, // rose
  { bg: "rgba(129, 140, 248, 0.1)", text: "#818CF8", border: "rgba(129, 140, 248, 0.3)" }, // indigo
  { bg: "rgba(34, 211, 238, 0.1)", text: "#22D3EE", border: "rgba(34, 211, 238, 0.3)" }, // cyan
  { bg: "rgba(167, 139, 250, 0.1)", text: "#A78BFA", border: "rgba(167, 139, 250, 0.3)" }, // violet
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

/** Convert a `Bridges` enum value to badge colors, generating a stable fallback for anything not curated. */
export function getBridgeColors(bridge: Bridges): { bg: string; text: string; border: string } {
  return KNOWN_BRIDGE_COLORS[bridge] ?? FALLBACK_BRIDGE_PALETTE[hashString(bridge) % FALLBACK_BRIDGE_PALETTE.length];
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

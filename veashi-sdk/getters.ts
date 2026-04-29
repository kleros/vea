import { ROUTES } from "./registry";
import { Bridges, type FlatRouteFile, type HashiAddress } from "./types";

/* --------------------------------------------------
   Internal helper
-------------------------------------------------- */

function routeKey(sourceChainId: number, destinationChainId: number): string {
  return `${sourceChainId}-${destinationChainId}`;
}

export function getRoute(sourceChainId: number, destinationChainId: number): FlatRouteFile | undefined {
  return ROUTES[routeKey(sourceChainId, destinationChainId)];
}

function bridgeField(bridge: Bridges, kind: "Reporter" | "Adapter"): keyof FlatRouteFile {
  return `${bridge}${kind}` as keyof FlatRouteFile;
}

/* --------------------------------------------------
   Public getters – bridges
-------------------------------------------------- */

export function getBridgeAddresses(
  sourceChainId: number,
  destinationChainId: number,
  bridge: Bridges
): HashiAddress | undefined {
  const route = getRoute(sourceChainId, destinationChainId);
  if (!route) return undefined;

  const reporter = route[bridgeField(bridge, "Reporter")] as `0x${string}` | undefined;
  const adapter = route[bridgeField(bridge, "Adapter")] as `0x${string}` | undefined;

  if (!reporter || !adapter) return undefined;

  return { reporter, adapter };
}

export function getReporter(sourceChainId: number, destinationChainId: number, bridge: Bridges) {
  return getBridgeAddresses(sourceChainId, destinationChainId, bridge)?.reporter;
}

export function getAdapter(sourceChainId: number, destinationChainId: number, bridge: Bridges) {
  return getBridgeAddresses(sourceChainId, destinationChainId, bridge)?.adapter;
}

/* --------------------------------------------------
   Public getters – route extras
-------------------------------------------------- */

export function getLightbulb(sourceChainId: number, destinationChainId: number) {
  return getRoute(sourceChainId, destinationChainId)?.lightbulb;
}

export function getSwitch(sourceChainId: number, destinationChainId: number) {
  return getRoute(sourceChainId, destinationChainId)?.switch;
}

export function getYaho(sourceChainId: number, destinationChainId: number) {
  return getRoute(sourceChainId, destinationChainId)?.yaho;
}

export function getYaru(sourceChainId: number, destinationChainId: number) {
  return getRoute(sourceChainId, destinationChainId)?.yaru;
}

export function getHashi(sourceChainId: number, destinationChainId: number) {
  return getRoute(sourceChainId, destinationChainId)?.hashi;
}
/* --------------------------------------------------
   Convenience helpers (UI-friendly)
-------------------------------------------------- */

export function hasRoute(sourceChainId: number, destinationChainId: number): boolean {
  return !!getRoute(sourceChainId, destinationChainId);
}

export function hasBridge(sourceChainId: number, destinationChainId: number, bridge: Bridges): boolean {
  return !!getBridgeAddresses(sourceChainId, destinationChainId, bridge);
}

export function getAvailableBridges(sourceChainId: number, destinationChainId: number): Bridges[] {
  const route = getRoute(sourceChainId, destinationChainId);
  if (!route) return [];

  return Object.values(Bridges).filter(
    (bridge) => route[bridgeField(bridge, "Reporter")] && route[bridgeField(bridge, "Adapter")]
  );
}

export function getAllSourceChains(): number[] {
  const keys = Object.keys(ROUTES);
  const sourceIds = keys.map((key) => parseInt(key.split("-")[0], 10));
  return Array.from(new Set(sourceIds)).sort((a, b) => a - b);
}

export function getDestinationChains(sourceChainId: number): number[] {
  const keys = Object.keys(ROUTES);
  const prefix = `${sourceChainId}-`;

  return keys
    .filter((key) => key.startsWith(prefix))
    .map((key) => parseInt(key.split("-")[1], 10))
    .sort((a, b) => a - b);
}

import { NO_CHAIN, type ChainFilter } from "@/lib/types";
import type { VeaBridgeKey, VeaNetwork, VeaRoute } from "./types";

export const VEA_ROUTES: VeaRoute[] = [
  {
    bridgeKey: "arbToEth",
    network: "testnet",
    label: "Arbitrum Sepolia → Sepolia (Testnet)",
    sourceChainId: 421614,
    destinationChainId: 11155111,
    inboxAddress: "0x8B925669606026CcCfAFD72840F5b0CAeDA80078",
    outboxAddress: "0xf720FA4575FB2FE96c7f05B1b5abc2d281cDa09a",
  },
  {
    bridgeKey: "arbToEth",
    network: "devnet",
    label: "Arbitrum Sepolia → Sepolia (Devnet)",
    sourceChainId: 421614,
    destinationChainId: 11155111,
    inboxAddress: "0x45138BC4E364A16919C4571699171d774A7590BD",
    outboxAddress: "0x60af9Fc1dd7d5bce69a66A8AEf456952b03A39C7",
  },
  {
    bridgeKey: "arbToGnosis",
    network: "testnet",
    label: "Arbitrum Sepolia → Gnosis Chiado (Testnet)",
    sourceChainId: 421614,
    destinationChainId: 10200,
    inboxAddress: "0x162f826E18380567CE0548395a3Ad2A54EA87B96",
    outboxAddress: "0x15aC29269b044E1d9042F597513B27Ffa4A7f257",
  },
  {
    bridgeKey: "arbToGnosis",
    network: "devnet",
    label: "Arbitrum Sepolia → Gnosis Chiado (Devnet)",
    sourceChainId: 421614,
    destinationChainId: 10200,
    inboxAddress: "0x2E973e20B24088bc74755a7A5cd1A37Dcb53E061",
    outboxAddress: "0x879A9F4476D4445A1deCf40175a700C4c829824D",
  },
];

export function getVeaRoute(bridgeKey: VeaBridgeKey, network: VeaNetwork): VeaRoute | undefined {
  return VEA_ROUTES.find((route) => route.bridgeKey === bridgeKey && route.network === network);
}

/** Every distinct source chain across all routes, for populating the "From Chain" dropdown. */
export function getVeaSourceChainIds(): number[] {
  return [...new Set(VEA_ROUTES.map((route) => route.sourceChainId))];
}

/** Distinct destination chains reachable from `sourceChainId` (or all, if NO_CHAIN), for the "To Chain" dropdown. */
export function getVeaDestinationChainIds(sourceChainId: ChainFilter): number[] {
  const matching =
    sourceChainId === NO_CHAIN ? VEA_ROUTES : VEA_ROUTES.filter((route) => route.sourceChainId === sourceChainId);
  return [...new Set(matching.map((route) => route.destinationChainId))];
}

/**
 * Routes matching the selected network and (optional) chain filters. NO_CHAIN on
 * either side means "any" — e.g. the default "All Chains" selection on both sides
 * returns every route for the network, to be merged into one combined view.
 */
export function getMatchingVeaRoutes(
  network: VeaNetwork,
  sourceChainId: ChainFilter,
  destinationChainId: ChainFilter
): VeaRoute[] {
  return VEA_ROUTES.filter(
    (route) =>
      route.network === network &&
      (sourceChainId === NO_CHAIN || route.sourceChainId === sourceChainId) &&
      (destinationChainId === NO_CHAIN || route.destinationChainId === destinationChainId)
  );
}

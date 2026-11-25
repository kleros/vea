import { useMemo } from "react";
import { getAllSourceChains, getDestinationChains, getAvailableBridges } from "@kleros/veashi-sdk";
import { Inline, Section, Stack } from "@kleros/ui-components-library/kit";
import { HeroPage } from "@/components/HeroPage";
import { NetworkSwitch } from "@/components/NetworkSwitch";
import RoutesTable, { type RouteRow } from "@/components/routes/RoutesTable";
import { useNetworkParam } from "@/hooks/useNetworkParam";
import { matchesNetwork } from "@/lib/chains";
import { plural } from "@/lib/format";
import type { Network } from "@/lib/types";

const NETWORKS = [
  { value: "mainnet", label: "Mainnet" },
  { value: "testnet", label: "Testnet" },
] as const satisfies readonly { value: Network; label: string }[];

/** `/routes`: every route Veashi supports on the network in the URL (`?network=testnet`), and its contracts. */
export default function RoutesPage() {
  const [network, setNetwork] = useNetworkParam();

  const routes = useMemo<RouteRow[]>(() => {
    const rows: RouteRow[] = [];
    for (const sourceChainId of getAllSourceChains()) {
      if (!matchesNetwork(sourceChainId, network)) continue;
      for (const destinationChainId of getDestinationChains(sourceChainId)) {
        rows.push({
          sourceChainId,
          destinationChainId,
          bridges: getAvailableBridges(sourceChainId, destinationChainId),
        });
      }
    }
    return rows;
  }, [network]);

  const networkName = network === "testnet" ? "Testnet" : "Mainnet";

  return (
    <HeroPage
      titleId="routes-title"
      hero={
        <Inline gap={6} justify="between" align="end">
          <Stack gap={2}>
            <h1 id="routes-title" className="text-klerosUIComponentsPrimaryText text-2xl font-semibold">
              Supported routes
            </h1>
            <p className="text-klerosUIComponentsSecondaryText text-sm">
              Every cross-chain route Veashi supports, and the bridges that secure each one. Open a route for its
              contracts.
            </p>
          </Stack>
          <NetworkSwitch label="Network" options={NETWORKS} value={network} onChange={setNetwork} />
        </Inline>
      }
    >
      <Section
        title={`${networkName} routes`}
        actions={<p className="text-klerosUIComponentsSecondaryText text-sm">{plural(routes.length, "route")}</p>}
      >
        <RoutesTable routes={routes} />
      </Section>
    </HeroPage>
  );
}

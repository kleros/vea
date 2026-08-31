import { useMemo, useState } from "react";
import { getAllSourceChains, getDestinationChains, getAvailableBridges } from "@kleros/veashi-sdk";
import Header from "@/components/Header";
import NetworkToggle from "@/components/NetworkToggle";
import RoutesTable, { type RouteRow } from "@/components/routes/RoutesTable";
import { matchesNetwork } from "@/lib/chains";
import type { Network } from "@/lib/types";

export default function RoutesPage() {
  const [network, setNetwork] = useState<Network>("mainnet");

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

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="animate-fade-in flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold bg-linear-to-r from-white to-(--text-secondary) bg-clip-text text-transparent">
              Supported Routes
            </h2>
            <p className="text-sm text-(--text-muted) mt-1">
              Every cross-chain route Veashi supports, and the bridges securing each one.
            </p>
          </div>
          <NetworkToggle value={network} onChange={setNetwork} />
        </div>

        <div className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <RoutesTable routes={routes} />
        </div>
      </main>
    </div>
  );
}

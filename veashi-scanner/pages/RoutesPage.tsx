import { useMemo } from "react";
import { getAllSourceChains, getDestinationChains, getAvailableBridges } from "@kleros/veashi-sdk";
import Header from "@/components/Header";
import RoutesTable, { type RouteRow } from "@/components/routes/RoutesTable";

export default function RoutesPage() {
  const routes = useMemo<RouteRow[]>(() => {
    const rows: RouteRow[] = [];
    for (const sourceChainId of getAllSourceChains()) {
      for (const destinationChainId of getDestinationChains(sourceChainId)) {
        rows.push({
          sourceChainId,
          destinationChainId,
          bridges: getAvailableBridges(sourceChainId, destinationChainId),
        });
      }
    }
    return rows;
  }, []);

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-2/3 mx-auto p-6 space-y-6">
        <div className="animate-fade-in">
          <h2 className="text-2xl font-bold bg-linear-to-r from-white to-(--text-secondary) bg-clip-text text-transparent">
            Supported Routes
          </h2>
          <p className="text-sm text-(--text-muted) mt-1">
            Every cross-chain route Veashi supports, and the bridges securing each one.
          </p>
        </div>

        <div className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <RoutesTable routes={routes} />
        </div>
      </main>
    </div>
  );
}

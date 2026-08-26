import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import Pagination from "@/components/Pagination";
import VeaFilterBar from "@/components/vea/VeaFilterBar";
import VeaEpochsTable from "@/components/vea/VeaEpochsTable";
import VeaSearchBar from "@/components/vea/VeaSearchBar";
import { getMatchingVeaRoutes } from "@/lib/vea/config";
import { useVeaEpochs } from "@/hooks/useVeaEpochs";
import { NO_CHAIN, type ChainFilter } from "@/lib/types";
import type { VeaNetwork } from "@/lib/vea/types";

const ITEMS_PER_PAGE = 10;

export default function VeaPage() {
  const [network, setNetwork] = useState<VeaNetwork>("testnet");
  const [sourceChain, setSourceChain] = useState<ChainFilter>(NO_CHAIN);
  const [destChain, setDestChain] = useState<ChainFilter>(NO_CHAIN);
  const [currentPage, setCurrentPage] = useState(1);

  // NO_CHAIN (the default) matches every route for the selected network, merging
  // both bridges into one combined, newest-first view.
  const routes = useMemo(
    () => getMatchingVeaRoutes(network, sourceChain, destChain),
    [network, sourceChain, destChain]
  );
  const { rows, isLoading, error } = useVeaEpochs(routes);

  const totalPages = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return rows.slice(start, start + ITEMS_PER_PAGE);
  }, [rows, currentPage]);

  const handleNetworkChange = (next: VeaNetwork) => {
    setNetwork(next);
    setCurrentPage(1);
  };

  const handleSourceChange = (chain: ChainFilter) => {
    setSourceChain(chain);
    setDestChain(NO_CHAIN);
    setCurrentPage(1);
  };

  const handleDestChange = (chain: ChainFilter) => {
    setDestChain(chain);
    setCurrentPage(1);
  };

  const hasActiveFilter = sourceChain !== NO_CHAIN || destChain !== NO_CHAIN;

  const clearFilters = () => {
    setSourceChain(NO_CHAIN);
    setDestChain(NO_CHAIN);
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="animate-fade-in">
          <h2 className="text-2xl font-bold bg-linear-to-r from-white to-(--text-secondary) bg-clip-text text-transparent">
            Vea Epochs
          </h2>
          <p className="text-sm text-(--text-muted) mt-1">
            Snapshot, claim, and verification lifecycle for each Vea bridge epoch.
          </p>
        </div>

        <div className="animate-fade-in" style={{ animationDelay: "0.05s" }}>
          <VeaSearchBar />
        </div>

        <div className="animate-fade-in" style={{ animationDelay: "0.08s" }}>
          <VeaFilterBar
            network={network}
            onNetworkChange={handleNetworkChange}
            sourceChain={sourceChain}
            destChain={destChain}
            onSourceChange={handleSourceChange}
            onDestChange={handleDestChange}
            hasActiveFilter={hasActiveFilter}
            onClearFilters={clearFilters}
          />
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-base text-red-500 text-sm animate-fade-in">
            {error}
          </div>
        )}

        <div className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <VeaEpochsTable rows={paginatedRows} isLoading={isLoading} onClearFilters={clearFilters} />
        </div>

        <div className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
        </div>
      </main>
    </div>
  );
}

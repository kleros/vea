import { useState, useMemo, useEffect } from "react";
import Header from "@/components/Header";
import SearchBar from "@/components/SearchBar";
import Pagination from "@/components/Pagination";
import ChainFilterPanel from "@/components/ChainFilterPanel";
import { NO_CHAIN, ChainFilter, MessageStats } from "@/lib/types";
import MessagesTable from "@/components/MessagesTable";
import { parseBlockInput } from "@/lib/utils";
import { useMessageScanner } from "@/hooks/useMessageScanner";
import { useDebounce } from "@/hooks/useDebounce";

const ITEMS_PER_PAGE = 10;

export default function Home() {
  const [currentPage, setCurrentPage] = useState(1);
  const [sourceChain, setSourceChain] = useState<ChainFilter>(NO_CHAIN);
  const [destChain, setDestChain] = useState<ChainFilter>(NO_CHAIN);
  const [fromBlock, setFromBlock] = useState("");
  const [toBlock, setToBlock] = useState("");

  // Debounce so a scan fires after the user stops typing for 600 ms.
  const debouncedFromBlock = useDebounce(fromBlock, 600);
  const debouncedToBlock = useDebounce(toBlock, 600);

  const parsedFromBlock = useMemo(() => parseBlockInput(debouncedFromBlock), [debouncedFromBlock]);
  const parsedToBlock = useMemo(() => parseBlockInput(debouncedToBlock), [debouncedToBlock]);

  const { messages, isScanning, blockRange, error } = useMessageScanner(
    sourceChain,
    destChain,
    parsedFromBlock,
    parsedToBlock
  );

  const hasActiveFilter = sourceChain !== NO_CHAIN || destChain !== NO_CHAIN;

  const totalPages = Math.max(1, Math.ceil(messages.length / ITEMS_PER_PAGE));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const paginatedMessages = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return messages.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [messages, currentPage]);

  const handleSourceChange = (chain: ChainFilter) => {
    setSourceChain(chain);
    setCurrentPage(1);
  };

  const handleDestChange = (chain: ChainFilter) => {
    setDestChain(chain);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSourceChain(NO_CHAIN);
    setDestChain(NO_CHAIN);
    setFromBlock("");
    setToBlock("");
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-2/3 mx-auto p-6 space-y-6">
        <div className="animate-fade-in">
          <SearchBar />
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm animate-fade-in">
            {error}
          </div>
        )}

        <div className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <ChainFilterPanel
            sourceChain={sourceChain}
            destChain={destChain}
            onSourceChange={handleSourceChange}
            onDestChange={handleDestChange}
            blockRange={blockRange}
            fromBlock={fromBlock}
            toBlock={toBlock}
            onFromBlockChange={(val) => {
              setFromBlock(val);
              setCurrentPage(1);
            }}
            onToBlockChange={(val) => {
              setToBlock(val);
              setCurrentPage(1);
            }}
            hasActiveFilter={hasActiveFilter}
            onClearFilters={clearFilters}
          />
        </div>

        <div className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold bg-linear-to-r from-white to-(--text-secondary) bg-clip-text text-transparent flex items-center gap-3">
              Cross-Chain Messages
              {isScanning && (
                <span className="text-sm font-normal text-purple-500 animate-pulse flex items-center gap-1.5">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                    <path
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      className="opacity-75"
                    />
                  </svg>
                </span>
              )}
            </h2>
            <span className="text-sm text-(--text-muted)">{messages.length} messages found</span>
          </div>

          <MessagesTable messages={paginatedMessages} isLoading={isScanning} onClearFilters={clearFilters} />
        </div>

        <div className="animate-fade-in" style={{ animationDelay: "0.3s" }}>
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
        </div>
      </main>
    </div>
  );
}

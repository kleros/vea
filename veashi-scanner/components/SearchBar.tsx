"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getAllSourceChains } from "@kleros/veashi-sdk";
import { ChainSelect, NO_CHAIN, type ChainFilter } from "@/components/ChainFilterPanel";
import { findChainForTx } from "@/lib/utils";

export default function SearchBar() {
  const [search, setSearch] = useState("");
  const [selectedChain, setSelectedChain] = useState<ChainFilter>(NO_CHAIN);
  const [isSearching, setIsSearching] = useState(false);
  const router = useRouter();

  const availableChainIds = useMemo(() => {
    try {
      return getAllSourceChains();
    } catch {
      return [];
    }
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedHash = search.trim();

    if (!trimmedHash) return;

    setIsSearching(true);

    try {
      if (selectedChain !== NO_CHAIN) {
        // User explicitly picked a chain
        router.push(`/tx/${selectedChain}/${trimmedHash}`);
      } else {
        // User left it as "All Chains", so we try to find it dynamically
        const foundChainId = await findChainForTx(trimmedHash);

        if (foundChainId) {
          router.push(`/tx/${foundChainId}/${trimmedHash}`);
        }
      }
    } catch (error) {
      console.error("Failed to route to transaction:", error);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <form onSubmit={handleSearch} className="w-full">
      <div className="relative flex items-stretch w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg focus-within:ring-2 focus-within:ring-purple-600 focus-within:border-transparent transition-all overflow-hidden shadow-sm">
        {/* Search Icon */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Search Input */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by transaction hash..."
          disabled={isSearching}
          className="flex-grow px-5 py-3 pl-12 bg-transparent text-sm font-mono placeholder:text-[var(--text-muted)] focus:outline-none disabled:opacity-50"
        />

        {/* Clear Button */}
        {search && !isSearching && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="px-2 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Clear search"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Vertical Divider */}
        <div className="h-6 w-px bg-[var(--border)] my-auto flex-shrink-0" />

        {/* Chain Selector Wrapper */}
        <div
          className={`flex-shrink-0 w-40 sm:w-56 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-stretch [&>div]:w-full [&_div.relative]:w-full [&_div.relative]:h-full ${
            isSearching ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          <ChainSelect
            label="Search Chain"
            value={selectedChain}
            options={availableChainIds}
            onChange={(val) => {
              setSelectedChain(val);
            }}
            hideLabel
            hideBadge
            className="w-full h-full bg-transparent text-sm py-3 pl-4 pr-10 cursor-pointer border-none focus:ring-0 outline-none truncate appearance-none"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!search.trim() || isSearching}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 disabled:text-white/70 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex-shrink-0 flex items-center justify-center min-w-[100px]"
        >
          {isSearching ? (
            <svg
              className="animate-spin h-5 w-5 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          ) : (
            "Search"
          )}
        </button>
      </div>
    </form>
  );
}

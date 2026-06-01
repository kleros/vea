"use client";

import { useMemo } from "react";
import ChainBadge from "@/components/ChainBadge";
import { getChainName } from "@/lib/chains";
import { getAllSourceChains, getDestinationChains } from "@kleros/veashi-sdk";

// ─── Exported types ──────────────────────────────────────────────────────────

export const NO_CHAIN = "No Chain" as const;
export type ChainFilter = number | typeof NO_CHAIN;

export interface BlockRange {
  chain: string;
  start: number;
  end: number;
  windowSize: number;
}

export interface MessageStats {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  sourceChain: ChainFilter;
  destChain: ChainFilter;
  onSourceChange: (chain: ChainFilter) => void;
  onDestChange: (chain: ChainFilter) => void;
  blockRange: BlockRange | null;
  fromBlock: string;
  toBlock: string;
  onFromBlockChange: (val: string) => void;
  onToBlockChange: (val: string) => void;
  stats: MessageStats;
  hasActiveFilter: boolean;
  onClearFilters: () => void;
}

export default function ChainFilterPanel({
  sourceChain,
  destChain,
  onSourceChange,
  onDestChange,
  blockRange,
  fromBlock,
  toBlock,
  onFromBlockChange,
  onToBlockChange,
  stats,
  hasActiveFilter,
  onClearFilters,
}: Props) {
  const availableSourceChains = useMemo(() => {
    try {
      return getAllSourceChains();
    } catch {
      return [];
    }
  }, []);

  const availableDestChains = useMemo(() => {
    if (sourceChain === NO_CHAIN) return [];
    try {
      return getDestinationChains(sourceChain);
    } catch {
      return [];
    }
  }, [sourceChain]);

  return (
    <div className="glass rounded-xl border border-(--border) overflow-hidden">
      <PanelHeader hasActiveFilter={hasActiveFilter} onClearFilters={onClearFilters} />

      <div className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <ChainSelect
            label="Source Chain"
            value={sourceChain}
            options={availableSourceChains}
            onChange={(val) => {
              onSourceChange(val);
              onDestChange(NO_CHAIN); // reset dest when source changes
            }}
          />
          <ChainSelect
            label="Destination Chain"
            value={destChain}
            options={availableDestChains}
            onChange={onDestChange}
            disabled={sourceChain === NO_CHAIN}
          />
        </div>

        <div className="mt-4 pt-4 border-t border-(--border)">
          <BlockRangeSection
            blockRange={blockRange}
            fromBlock={fromBlock}
            toBlock={toBlock}
            onFromBlockChange={onFromBlockChange}
            onToBlockChange={onToBlockChange}
            disabled={sourceChain === NO_CHAIN || destChain === NO_CHAIN}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components (private) ─────────────────────────────────────────────────

function PanelHeader({ hasActiveFilter, onClearFilters }: { hasActiveFilter: boolean; onClearFilters: () => void }) {
  return (
    <div className="px-5 py-3 border-b border-(--border) flex items-center justify-between bg-(--surface)">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
          />
        </svg>
        <span className="text-sm font-semibold text-(--text-secondary)">Filter Messages</span>
        {hasActiveFilter && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-purple-700 text-white font-medium">Active</span>
        )}
      </div>
      {hasActiveFilter && (
        <button
          onClick={onClearFilters}
          className="text-xs text-(--text-muted) hover:text-pink-500 transition-colors flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Clear filters
        </button>
      )}
    </div>
  );
}

// Export this from your ChainFilterPanel file, or move it to a shared components folder
export function ChainSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  hideLabel = false,
  hideBadge = false,
  className = "",
}: {
  label: string;
  value: ChainFilter;
  options: number[];
  onChange: (chain: ChainFilter) => void;
  disabled?: boolean;
  hideLabel?: boolean;
  hideBadge?: boolean;
  className?: string;
}) {
  return (
    <div className={disabled ? "opacity-50 pointer-events-none" : ""}>
      {!hideLabel && (
        <label className="text-xs font-semibold uppercase tracking-wider text-(--text-muted) mb-2 block">{label}</label>
      )}
      <div className="relative">
        <select
          value={value.toString()}
          onChange={(e) => {
            const val = e.target.value;
            onChange(val === NO_CHAIN ? NO_CHAIN : Number(val));
          }}
          disabled={disabled}
          // Merge custom className for overrides, fallback to default styling if none provided
          className={`appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent transition-all pr-10 ${
            className || "w-full px-4 py-2.5 bg-(--surface) border border-(--border) rounded-lg text-sm"
          }`}
          style={{
            color: value === NO_CHAIN ? "var(--text-muted)" : "var(--text-primary)",
          }}
        >
          <option value={NO_CHAIN}>{disabled ? "Select Source First" : "All Chains"}</option>
          {options.map((chainId) => (
            <option key={chainId} value={chainId}>
              {getChainName(chainId)}
            </option>
          ))}
        </select>
        <svg
          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted) pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {!hideBadge && value !== NO_CHAIN && !disabled && (
        <div className="mt-2">
          <ChainBadge chainId={value as number} />
        </div>
      )}
    </div>
  );
}

function BlockRangeSection({
  blockRange,
  fromBlock,
  toBlock,
  onFromBlockChange,
  onToBlockChange,
  disabled,
}: {
  blockRange: BlockRange | null;
  fromBlock: string;
  toBlock: string;
  onFromBlockChange: (val: string) => void;
  onToBlockChange: (val: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <svg className="w-3.5 h-3.5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
        <span className="text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
          Block Range{" "}
          <span className="normal-case font-normal">
            (optional — leave blank to scan latest {(1_000_000).toLocaleString()} blocks)
          </span>
        </span>
      </div>

      <div className={`grid grid-cols-2 gap-3 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
        <div>
          <label className="text-xs text-(--text-muted) mb-1.5 block">From Block</label>
          <input
            type="number"
            min={0}
            placeholder="e.g. 18000000"
            value={fromBlock}
            onChange={(e) => onFromBlockChange(e.target.value)}
            className="w-full px-3 py-2 bg-(--surface) border border-(--border) rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent transition-all placeholder:text-(--text-muted)"
          />
        </div>
        <div>
          <label className="text-xs text-(--text-muted) mb-1.5 block">To Block</label>
          <input
            type="number"
            min={0}
            placeholder="e.g. 18010000"
            value={toBlock}
            onChange={(e) => onToBlockChange(e.target.value)}
            className="w-full px-3 py-2 bg-(--surface) border border-(--border) rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent transition-all placeholder:text-(--text-muted)"
          />
        </div>
      </div>

      {blockRange && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-(--surface) border border-(--border)">
          <span className="text-xs text-(--text-muted)">
            Scanning <span className="font-semibold text-(--text-secondary)">{blockRange.chain}</span> blocks{" "}
            <span className="font-mono text-purple-500">#{blockRange.start.toLocaleString()}</span>
            {" → "}
            <span className="font-mono text-purple-500">#{blockRange.end.toLocaleString()}</span>
            <span className="text-(--text-muted)"> ({blockRange.windowSize.toLocaleString()} blocks)</span>
          </span>
        </div>
      )}
    </div>
  );
}

const STAT_COLORS = {
  green: { wrapper: "bg-green-400/5 border-green-400/20", text: "text-green-400" },
  amber: { wrapper: "bg-amber-400/5 border-amber-400/20", text: "text-amber-400" },
  red: { wrapper: "bg-red-400/5 border-red-400/20", text: "text-red-400" },
} as const;

function StatCard({ label, value, color }: { label: string; value: number; color?: keyof typeof STAT_COLORS }) {
  const cls = color ? STAT_COLORS[color] : null;
  return (
    <div
      className={`text-center px-3 py-2.5 rounded-lg border ${cls ? cls.wrapper : "bg-(--surface) border-(--border)"}`}
    >
      <div className={`text-xl font-bold font-mono ${cls?.text ?? ""}`}>{value}</div>
      <div className="text-xs text-(--text-muted) mt-0.5">{label}</div>
    </div>
  );
}

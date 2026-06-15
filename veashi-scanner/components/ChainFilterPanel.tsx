"use client";

import { useMemo, FC } from "react";
import { Button, DropdownSelect as RawDropdownSelect, NumberField } from "@kleros/ui-components-library";
import { getAllSourceChains, getDestinationChains } from "@kleros/veashi-sdk";
import ChainBadge from "@/components/ChainBadge";
import { getChainName } from "@/lib/chains";
import { ChainItem, DropdownSelectProps, NO_CHAIN, ChainFilter, BlockRange, MessageStats } from "@/lib/types";

const DropdownSelect = RawDropdownSelect as unknown as FC<DropdownSelectProps>;

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
      {hasActiveFilter && <Button variant="secondary" small onPress={onClearFilters} text="Clear filters" />}
    </div>
  );
}

function ChainSelect({
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
  const items: ChainItem[] = [
    {
      id: NO_CHAIN,
      text: disabled ? "Select Source First" : "All Chains",
      itemValue: NO_CHAIN,
    },
    ...options.map<ChainItem>((chainId) => ({
      id: chainId,
      text: getChainName(chainId),
      itemValue: chainId,
    })),
  ];

  return (
    <div className={className}>
      {!hideLabel && (
        <label className="text-xs font-semibold uppercase tracking-wider text-(--klerosUIComponentsSecondaryText) mb-2 block">
          {label}
        </label>
      )}

      <DropdownSelect
        items={items}
        selectedKey={value}
        isDisabled={disabled}
        placeholder="All Chains"
        callback={(item) => {
          onChange(item.id === NO_CHAIN ? NO_CHAIN : Number(item.id));
        }}
        className="w-full"
      />

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
        <span className="text-xs font-semibold uppercase tracking-wider text-(--text-muted)">Block Range</span>
      </div>

      <div className={`grid grid-cols-2 gap-3 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
        <div>
          <NumberField
            label="From Block"
            value={fromBlock === "" ? NaN : Number(fromBlock)}
            onChange={(n) => onFromBlockChange(Number.isNaN(n) ? "" : String(n))}
            minValue={0}
            placeholder="e.g. 18000000"
            isDisabled={disabled}
            inputProps={{ className: "font-mono" }}
            className="w-full"
          />
        </div>
        <div>
          <NumberField
            label="To Block"
            value={toBlock === "" ? NaN : Number(toBlock)}
            onChange={(n) => onToBlockChange(Number.isNaN(n) ? "" : String(n))}
            minValue={0}
            placeholder="e.g. 18010000"
            isDisabled={disabled}
            inputProps={{ className: "font-mono" }}
            className="w-full"
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

import { useMemo } from "react";
import { NumberField } from "@kleros/ui-components-library";
import { getAllSourceChains, getDestinationChains } from "@kleros/veashi-sdk";
import ChainSelect from "@/components/ChainSelect";
import FilterPanelHeader from "@/components/FilterPanelHeader";
import { matchesNetwork } from "@/lib/chains";
import { NO_CHAIN, ChainFilter, BlockRange, Network } from "@/lib/types";

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
  hasActiveFilter: boolean;
  onClearFilters: () => void;
  network?: Network;
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
  hasActiveFilter,
  onClearFilters,
  network,
}: Props) {
  const availableSourceChains = useMemo(() => {
    try {
      const chains = getAllSourceChains();
      return network ? chains.filter((id) => matchesNetwork(id, network)) : chains;
    } catch {
      return [];
    }
  }, [network]);

  const availableDestChains = useMemo(() => {
    if (sourceChain === NO_CHAIN) return [];
    try {
      const chains = getDestinationChains(sourceChain);
      return network ? chains.filter((id) => matchesNetwork(id, network)) : chains;
    } catch {
      return [];
    }
  }, [sourceChain, network]);

  return (
    <div className="glass border border-(--border) overflow-hidden">
      <FilterPanelHeader title="Filter Messages" hasActiveFilter={hasActiveFilter} onClearFilters={onClearFilters} />

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

function BlockRangeSection({
  blockRange,
  fromBlock,
  toBlock,
  onFromBlockChange,
  onToBlockChange,
  disabled,
}: Readonly<{
  blockRange: BlockRange | null;
  fromBlock: string;
  toBlock: string;
  onFromBlockChange: (val: string) => void;
  onToBlockChange: (val: string) => void;
  disabled: boolean;
}>) {
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
            value={fromBlock === "" ? Number.NaN : Number(fromBlock)}
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
        <div className="flex items-center gap-2 px-3 py-2 rounded-base bg-(--surface) border border-(--border)">
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

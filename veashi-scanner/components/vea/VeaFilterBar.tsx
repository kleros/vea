import { useMemo } from "react";
import ChainSelect from "@/components/ChainSelect";
import FilterPanelHeader from "@/components/FilterPanelHeader";
import SegmentedToggle from "@/components/SegmentedToggle";
import { getVeaDestinationChainIds, getVeaSourceChainIds } from "@/lib/vea/config";
import { type ChainFilter } from "@/lib/types";
import type { VeaNetwork } from "@/lib/vea/types";

const NETWORK_OPTIONS: { value: VeaNetwork; label: string }[] = [
  { value: "testnet", label: "Testnet" },
  { value: "devnet", label: "Devnet" },
];

interface VeaFilterBarProps {
  network: VeaNetwork;
  onNetworkChange: (network: VeaNetwork) => void;
  sourceChain: ChainFilter;
  destChain: ChainFilter;
  onSourceChange: (chain: ChainFilter) => void;
  onDestChange: (chain: ChainFilter) => void;
  hasActiveFilter: boolean;
  onClearFilters: () => void;
}

export default function VeaFilterBar({
  network,
  onNetworkChange,
  sourceChain,
  destChain,
  onSourceChange,
  onDestChange,
  hasActiveFilter,
  onClearFilters,
}: Readonly<VeaFilterBarProps>) {
  const sourceOptions = useMemo(() => getVeaSourceChainIds(), []);
  const destOptions = useMemo(() => getVeaDestinationChainIds(sourceChain), [sourceChain]);

  return (
    <div className="glass border border-(--border) overflow-hidden">
      <FilterPanelHeader title="Filter Epochs" hasActiveFilter={hasActiveFilter} onClearFilters={onClearFilters} />

      <div className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <ChainSelect label="From Chain" value={sourceChain} options={sourceOptions} onChange={onSourceChange} />
          <ChainSelect label="To Chain" value={destChain} options={destOptions} onChange={onDestChange} />
          <div className="flex flex-col">
            <label className="text-xs font-semibold uppercase tracking-wider text-(--klerosUIComponentsSecondaryText) mb-2 block">
              Network
            </label>
            <div className="flex-1 flex items-center">
              <SegmentedToggle options={NETWORK_OPTIONS} value={network} onChange={onNetworkChange} size="md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

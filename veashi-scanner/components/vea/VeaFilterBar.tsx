import { useMemo, FC } from "react";
import { DropdownSelect as RawDropdownSelect } from "@kleros/ui-components-library";
import ChainBadge from "@/components/ChainBadge";
import { getChainName } from "@/lib/chains";
import { getVeaDestinationChainIds, getVeaSourceChainIds } from "@/lib/vea/config";
import { ChainItem, DropdownSelectProps, NO_CHAIN, ChainFilter } from "@/lib/types";
import type { VeaNetwork } from "@/lib/vea/types";

const DropdownSelect = RawDropdownSelect as unknown as FC<DropdownSelectProps>;

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
}

export default function VeaFilterBar({
  network,
  onNetworkChange,
  sourceChain,
  destChain,
  onSourceChange,
  onDestChange,
}: Readonly<VeaFilterBarProps>) {
  const sourceOptions = useMemo(() => getVeaSourceChainIds(), []);
  const destOptions = useMemo(() => getVeaDestinationChainIds(sourceChain), [sourceChain]);

  return (
    <div className="glass border border-(--border) p-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <ChainSelect label="From Chain" value={sourceChain} options={sourceOptions} onChange={onSourceChange} />
        <ChainSelect label="To Chain" value={destChain} options={destOptions} onChange={onDestChange} />
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-(--klerosUIComponentsSecondaryText) mb-2 block">
            Network
          </label>
          <SegmentedControl options={NETWORK_OPTIONS} value={network} onChange={onNetworkChange} />
        </div>
      </div>
    </div>
  );
}

// ─── Private sub-components ───────────────────────────────────────────────────

function ChainSelect({
  label,
  value,
  options,
  onChange,
}: Readonly<{ label: string; value: ChainFilter; options: number[]; onChange: (chain: ChainFilter) => void }>) {
  const items: ChainItem[] = [
    { id: NO_CHAIN, text: "All Chains", itemValue: NO_CHAIN },
    ...options.map<ChainItem>((chainId) => ({ id: chainId, text: getChainName(chainId), itemValue: chainId })),
  ];

  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wider text-(--klerosUIComponentsSecondaryText) mb-2 block">
        {label}
      </label>
      <DropdownSelect
        items={items}
        selectedKey={value}
        placeholder="All Chains"
        callback={(item) => onChange(item.id === NO_CHAIN ? NO_CHAIN : Number(item.id))}
        className="w-full"
      />
      {value !== NO_CHAIN && (
        <div className="mt-2">
          <ChainBadge chainId={value as number} />
        </div>
      )}
    </div>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: Readonly<{ options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }>) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-(--border) bg-(--surface) p-1 shrink-0">
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              isActive ? "bg-purple-700 text-white" : "text-(--text-muted) hover:text-(--text-secondary)"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

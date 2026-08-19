import { FC } from "react";
import { DropdownSelect as RawDropdownSelect } from "@kleros/ui-components-library";
import ChainBadge from "@/components/ChainBadge";
import { getChainName } from "@/lib/chains";
import { ChainItem, DropdownSelectProps, NO_CHAIN, ChainFilter } from "@/lib/types";

const DropdownSelect = RawDropdownSelect as unknown as FC<DropdownSelectProps>;

interface ChainSelectProps {
  label: string;
  value: ChainFilter;
  options: number[];
  onChange: (chain: ChainFilter) => void;
  disabled?: boolean;
  hideLabel?: boolean;
  hideBadge?: boolean;
  className?: string;
}

export default function ChainSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  hideLabel = false,
  hideBadge = false,
  className = "",
}: Readonly<ChainSelectProps>) {
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

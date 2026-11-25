import { useId, type FC } from "react";
import { DropdownSelect } from "@kleros/ui-components-library";
import { Inline } from "@kleros/ui-components-library/kit";
import { getChainName } from "@/lib/chains";
import { NO_CHAIN, type ChainFilter, type ChainItem, type DropdownSelectProps } from "@/lib/types";

/** The core DropdownSelect, typed with its react-aria Select props (library-log #8). */
const ChainDropdown: FC<DropdownSelectProps> = DropdownSelect;

function chainItems(chainIds: readonly number[]): ChainItem[] {
  return [
    { id: NO_CHAIN, text: "All chains", itemValue: NO_CHAIN },
    ...chainIds.map((id) => ({ id, text: getChainName(id), itemValue: id })),
  ];
}

const toFilter = (item: ChainItem): ChainFilter => (item.itemValue === undefined ? NO_CHAIN : item.itemValue);

export interface ChainFilterSelectProps {
  /** The quiet label before the dropdown ("From", "To"); it names the dropdown. */
  label: string;
  /** The chains to offer, after "All chains". */
  chainIds: readonly number[];
  /** The picked chain, or NO_CHAIN for "All chains". */
  value: ChainFilter;
  onChange: (chain: ChainFilter) => void;
  /** Extra classes, merged last. */
  className?: string;
}

/**
 * ChainFilterSelect: a quiet label and a core DropdownSelect of chains, "All chains" first (the From / To filters on
 * Home and Vea). The label sits beside the trigger, so it names the dropdown through `aria-labelledby`.
 * Tailwind classes only: library parts, kit layout and klerosUIComponents* tokens (agent/LOOK.md).
 */
export function ChainFilterSelect({ label, chainIds, value, onChange, className }: Readonly<ChainFilterSelectProps>) {
  const labelId = useId();
  return (
    <Inline gap={2} className={className}>
      <span id={labelId} className="text-klerosUIComponentsSecondaryText text-sm">
        {label}
      </span>
      <ChainDropdown
        aria-labelledby={labelId}
        items={chainItems(chainIds)}
        selectedKey={value}
        callback={(item) => onChange(toFilter(item))}
      />
    </Inline>
  );
}

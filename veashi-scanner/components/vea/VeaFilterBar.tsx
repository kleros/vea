import { useMemo } from "react";
import { Button } from "@kleros/ui-components-library";
import { Inline } from "@kleros/ui-components-library/kit";
import { ChainFilterSelect } from "@/components/ChainFilterSelect";
import { getVeaDestinationChainIds, getVeaSourceChainIds } from "@/lib/vea/config";
import type { ChainFilter } from "@/lib/types";

interface VeaFilterBarProps {
  sourceChain: ChainFilter;
  destChain: ChainFilter;
  onSourceChange: (chain: ChainFilter) => void;
  onDestChange: (chain: ChainFilter) => void;
  hasActiveFilter: boolean;
  onClearFilters: () => void;
}

/** From and To (core DropdownSelect, "All chains" by default), and "Clear filters" while one is set, as Home's filters. */
export default function VeaFilterBar({
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
    <form aria-label="Filter epochs" onSubmit={(e) => e.preventDefault()}>
      <Inline gap={3}>
        <ChainFilterSelect label="From" chainIds={sourceOptions} value={sourceChain} onChange={onSourceChange} />
        <ChainFilterSelect label="To" chainIds={destOptions} value={destChain} onChange={onDestChange} />
        {hasActiveFilter && <Button variant="secondary" small text="Clear filters" onPress={onClearFilters} />}
      </Inline>
    </form>
  );
}

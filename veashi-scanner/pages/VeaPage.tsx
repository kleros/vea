import { useMemo, useState } from "react";
import { CompactPagination } from "@kleros/ui-components-library";
import { QueryState, Section, Stack } from "@kleros/ui-components-library/kit";
import { HeroPage } from "@/components/HeroPage";
import { NetworkSwitch } from "@/components/NetworkSwitch";
import VeaFilterBar from "@/components/vea/VeaFilterBar";
import VeaEpochsTable from "@/components/vea/VeaEpochsTable";
import VeaSearchBar from "@/components/vea/VeaSearchBar";
import { useRelativeTimeTick } from "@/hooks/useRelativeTimeTick";
import { useVeaEpochs } from "@/hooks/useVeaEpochs";
import { getMatchingVeaRoutes } from "@/lib/vea/config";
import { NO_CHAIN, type ChainFilter } from "@/lib/types";
import type { VeaNetwork } from "@/lib/vea/types";

const ITEMS_PER_PAGE = 10;
const NETWORK_NAME: Record<VeaNetwork, string> = { testnet: "Testnet", devnet: "Devnet" };
const NETWORKS = (["testnet", "devnet"] as const).map((value) => ({ value, label: NETWORK_NAME[value] }));

/** `/vea`: the epoch search, then the network's epochs (newest first) with From / To filters and paging. */
export default function VeaPage() {
  // Vea's networks are Testnet and Devnet, not Home's Mainnet / Testnet, so the choice stays in state, as before.
  const [network, setNetwork] = useState<VeaNetwork>("testnet");
  const [sourceChain, setSourceChain] = useState<ChainFilter>(NO_CHAIN);
  const [destChain, setDestChain] = useState<ChainFilter>(NO_CHAIN);
  const [page, setPage] = useState(1);
  useRelativeTimeTick();

  // NO_CHAIN (the default) matches every route for the selected network, merging both bridges into one newest-first
  // list.
  const routes = useMemo(
    () => getMatchingVeaRoutes(network, sourceChain, destChain),
    [network, sourceChain, destChain]
  );
  const { rows, isLoading, error } = useVeaEpochs(routes);

  const numPages = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));
  const currentPage = Math.min(page, numPages);
  const pageRows = rows.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const hasActiveFilter = sourceChain !== NO_CHAIN || destChain !== NO_CHAIN;
  const clearFilters = () => {
    setSourceChain(NO_CHAIN);
    setDestChain(NO_CHAIN);
    setPage(1);
  };

  return (
    <HeroPage
      titleId="vea-title"
      hero={
        <Stack gap={6}>
          <Stack gap={2}>
            <h1 id="vea-title" className="text-klerosUIComponentsPrimaryText text-2xl font-semibold">
              Vea epochs
            </h1>
            <p className="text-klerosUIComponentsSecondaryText text-sm">
              The snapshot, claim and verification of each Vea bridge epoch.
            </p>
          </Stack>
          <Stack gap={2}>
            <VeaSearchBar
              aside={
                <NetworkSwitch
                  label="Network"
                  options={NETWORKS}
                  value={network}
                  onChange={(next) => {
                    setNetwork(next);
                    setPage(1);
                  }}
                />
              }
            />
            <p className="text-klerosUIComponentsSecondaryText text-xs">
              Search checks every Vea route, testnet and devnet; a number that several routes share opens the newest
              snapshot. The network switch only changes the list below.
            </p>
          </Stack>
        </Stack>
      }
    >
      <Section
        title={`${NETWORK_NAME[network]} epochs`}
        actions={<p className="text-klerosUIComponentsSecondaryText text-sm">Newest first</p>}
      >
        <VeaFilterBar
          sourceChain={sourceChain}
          destChain={destChain}
          onSourceChange={(chain) => {
            setSourceChain(chain);
            setDestChain(NO_CHAIN);
            setPage(1);
          }}
          onDestChange={(chain) => {
            setDestChain(chain);
            setPage(1);
          }}
          hasActiveFilter={hasActiveFilter}
          onClearFilters={clearFilters}
        />
        <QueryState
          isLoading={isLoading && rows.length === 0}
          isError={Boolean(error)}
          error={error ? new Error(error) : undefined}
          data={pageRows}
          errorTitle="The epochs could not be loaded"
          empty={{
            title: "No epochs",
            description: "No epochs found for the selected chains and network.",
            action: hasActiveFilter ? { text: "Clear filters", onPress: clearFilters } : undefined,
          }}
        >
          {(visible) => (
            <Stack gap={4}>
              <VeaEpochsTable rows={visible} />
              <CompactPagination
                currentPage={currentPage}
                numPages={numPages}
                callback={setPage}
                label={`Page ${currentPage}`}
              />
            </Stack>
          )}
        </QueryState>
      </Section>
    </HeroPage>
  );
}

import { useState } from "react";
import { Button } from "@kleros/ui-components-library";
import { DataTable, QueryState, type DataTableColumn } from "@kleros/ui-components-library/kit";
import type { Bridges } from "@kleros/veashi-sdk";
import { getChainName } from "@/lib/chains";
import { plural } from "@/lib/format";
import { getBridgeLabel } from "@/lib/veashiHelpers";
import RouteDetailsModal from "./RouteDetailsModal";

export interface RouteRow {
  sourceChainId: number;
  destinationChainId: number;
  bridges: Bridges[];
}

interface Props {
  routes: RouteRow[];
}

const routeKey = (r: RouteRow) => `${r.sourceChainId}-${r.destinationChainId}`;
const routeName = (r: RouteRow) => `${getChainName(r.sourceChainId)} to ${getChainName(r.destinationChainId)}`;

/**
 * The routes (from the SDK, so no loading state) in kit QueryState + DataTable; a row press (or its Details button)
 * opens the route's contracts in a modal.
 */
export default function RoutesTable({ routes }: Readonly<Props>) {
  const [selected, setSelected] = useState<RouteRow | null>(null);

  const columns: DataTableColumn<RouteRow>[] = [
    {
      key: "from",
      header: "Source chain",
      width: 280,
      render: (r) => <span className="whitespace-nowrap">{getChainName(r.sourceChainId)}</span>,
    },
    {
      key: "to",
      header: "Destination chain",
      width: 280,
      render: (r) => <span className="whitespace-nowrap">{getChainName(r.destinationChainId)}</span>,
    },
    {
      key: "bridges",
      header: "Bridges",
      render: (r) => (
        <span className="whitespace-nowrap">
          {r.bridges.length === 0 ? "None" : r.bridges.map(getBridgeLabel).join(", ")}
          <span className="text-klerosUIComponentsSecondaryText"> · {plural(r.bridges.length, "bridge")}</span>
        </span>
      ),
    },
    {
      key: "details",
      header: "Contracts",
      align: "right",
      width: 136,
      render: (r) => (
        <Button variant="secondary" small text={`Contracts of ${routeName(r)}`} onPress={() => setSelected(r)}>
          Details
        </Button>
      ),
    },
  ];

  return (
    <>
      <QueryState
        isLoading={false}
        data={routes}
        empty={{ title: "No routes", description: "No route is configured on this network." }}
      >
        {(rows) => (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={routeKey}
            onRowPress={setSelected}
            className="bg-klerosUIComponentsWhiteBackground"
          />
        )}
      </QueryState>
      {selected && (
        <RouteDetailsModal
          isOpen
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          sourceChainId={selected.sourceChainId}
          destinationChainId={selected.destinationChainId}
          bridges={selected.bridges}
        />
      )}
    </>
  );
}

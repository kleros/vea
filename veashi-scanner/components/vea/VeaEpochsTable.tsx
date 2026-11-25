import { Link, useNavigate } from "react-router-dom";
import { DataTable, shortenAddress, type DataTableColumn } from "@kleros/ui-components-library/kit";
import { ChainRoute } from "@/components/ChainRoute";
import { TimeAgo } from "@/components/TimeAgo";
import VeaStatusBadge from "@/components/vea/VeaStatusBadge";
import type { VeaEpochRow } from "@/lib/vea/types";

interface Props {
  rows: VeaEpochRow[];
}

const epochPath = (row: VeaEpochRow) => `/vea/${row.route.bridgeKey}/${row.route.network}/${row.epoch}`;
// The indexer can return two saved snapshots for one epoch of a route (seen on testnet: same root and time), so the
// key adds the snapshot's own id.
const epochKey = (row: VeaEpochRow) =>
  `${row.route.bridgeKey}-${row.route.network}-${row.epoch}-${row.snapshot?.id ?? "none"}`;

/** One page of epochs as a kit DataTable; a row press opens the epoch, as the old table did. */
export default function VeaEpochsTable({ rows }: Readonly<Props>) {
  const navigate = useNavigate();
  const columns: DataTableColumn<VeaEpochRow>[] = [
    { key: "status", header: "Status", width: 160, render: (row) => <VeaStatusBadge status={row.status} /> },
    {
      key: "route",
      header: "Route",
      width: 320,
      render: (row) => <ChainRoute from={row.route.sourceChainId} to={row.route.destinationChainId} />,
    },
    {
      key: "epoch",
      header: "Epoch",
      width: 160,
      render: (row) => (
        <Link
          to={epochPath(row)}
          aria-label={`Epoch ${row.epoch}, ${row.route.label}`}
          className="text-klerosUIComponentsPrimaryBlue hover:text-klerosUIComponentsSecondaryBlue font-mono whitespace-nowrap"
        >
          #{row.epoch}
        </Link>
      ),
    },
    {
      key: "root",
      header: "State root",
      render: (row) => {
        const root = row.snapshot?.stateRoot ?? row.claim?.stateRoot;
        return root ? (
          <span title={root} className="font-mono whitespace-nowrap">
            {shortenAddress(root, 8)}
          </span>
        ) : (
          "—"
        );
      },
    },
    {
      key: "age",
      header: "Snapshot",
      align: "right",
      width: 140,
      render: (row) => <TimeAgo unixSeconds={row.snapshot?.timestamp} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={epochKey}
      onRowPress={(row) => navigate(epochPath(row))}
      className="bg-klerosUIComponentsWhiteBackground"
    />
  );
}

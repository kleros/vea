import { useNavigate } from "react-router-dom";
import { Button } from "@kleros/ui-components-library";
import ChainBadge from "@/components/ChainBadge";
import TableStatus from "@/components/TableStatus";
import VeaStatusBadge from "@/components/vea/VeaStatusBadge";
import { useRelativeTimeTick } from "@/hooks/useRelativeTimeTick";
import { formatRelativeTime } from "@/lib/utils";
import type { VeaEpochRow } from "@/lib/vea/types";

interface Props {
  rows: VeaEpochRow[];
  isLoading?: boolean;
  onClearFilters: () => void;
}

export default function VeaEpochsTable({ rows, isLoading, onClearFilters }: Readonly<Props>) {
  const navigate = useNavigate();
  useRelativeTimeTick();

  if (rows.length === 0 && isLoading) {
    return (
      <TableStatus
        icon={
          <svg className="w-8 h-8 mx-auto mb-3 text-purple-500 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
            <path
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              className="opacity-75"
            />
          </svg>
        }
        message="Loading epochs…"
      />
    );
  }

  if (rows.length === 0) {
    return (
      <TableStatus
        icon={
          <svg
            className="w-12 h-12 mx-auto mb-3 text-(--text-muted) opacity-40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        }
        message="No epochs found for the selected chains and network."
        action={<Button variant="secondary" small onPress={onClearFilters} className="mt-4" text="Clear Filters" />}
      />
    );
  }

  return (
    <div className="glass overflow-hidden border border-(--border)">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-(--border) bg-(--surface)">
              {["Route", "Epoch", "Status", "State Root", "Timestamp"].map((col) => (
                <th
                  key={col}
                  className="px-6 py-3 text-left text-xs font-semibold text-(--text-muted) uppercase tracking-wider"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-(--border)">
            {rows.map((row, index) => (
              <EpochRow
                key={`${row.route.bridgeKey}-${row.route.network}-${row.epoch}`}
                row={row}
                index={index}
                onClick={() => navigate(`/vea/${row.route.bridgeKey}/${row.route.network}/${row.epoch}`)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EpochRow({ row, index, onClick }: Readonly<{ row: VeaEpochRow; index: number; onClick: () => void }>) {
  const stateRoot = row.snapshot?.stateRoot ?? row.claim?.stateRoot;
  return (
    <tr
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onClick();
        }
      }}
      tabIndex={0}
      role="link"
      aria-label={`View epoch ${row.epoch} details`}
      className="hover-lift hover:bg-(--surface-elevated) cursor-pointer transition-all animate-fade-in"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <td className="px-6 py-3">
        <div className="flex items-center gap-2">
          <ChainBadge chainId={row.route.sourceChainId} />
          <svg className="w-4 h-4 text-purple-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <ChainBadge chainId={row.route.destinationChainId} />
        </div>
      </td>
      <td className="px-6 py-3">
        <span className="font-mono text-sm text-(--text-secondary)">#{row.epoch}</span>
      </td>
      <td className="px-6 py-3">
        <VeaStatusBadge status={row.status} />
      </td>
      <td className="px-6 py-3">
        <span className="font-mono text-sm">
          {stateRoot ? `${stateRoot.slice(0, 10)}…${stateRoot.slice(-8)}` : "—"}
        </span>
      </td>
      <td className="px-6 py-3">
        <span
          className="text-sm text-(--text-secondary)"
          title={row.snapshot?.timestamp ? new Date(row.snapshot.timestamp * 1000).toLocaleString() : undefined}
        >
          {formatRelativeTime(row.snapshot?.timestamp)}
        </span>
      </td>
    </tr>
  );
}

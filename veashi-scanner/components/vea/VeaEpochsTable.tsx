import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ChainBadge from "@/components/ChainBadge";
import VeaStatusBadge from "@/components/vea/VeaStatusBadge";
import { formatRelativeTime } from "@/lib/utils";
import type { VeaEpochRow } from "@/lib/vea/types";

const RELATIVE_TIME_REFRESH_MS = 30_000;

interface Props {
  rows: VeaEpochRow[];
  isLoading?: boolean;
}

export default function VeaEpochsTable({ rows, isLoading }: Readonly<Props>) {
  const navigate = useNavigate();

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), RELATIVE_TIME_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  if (rows.length === 0 && isLoading) {
    return (
      <div className="glass border border-(--border) py-16 text-center">
        <p className="text-(--text-muted) text-sm">Loading epochs…</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="glass border border-(--border) py-16 text-center">
        <p className="text-(--text-muted) text-sm">No epochs found for the selected chains and network.</p>
      </div>
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

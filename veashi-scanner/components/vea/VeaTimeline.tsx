import { DataTable, QueryState, shortenAddress, type DataTableColumn } from "@kleros/ui-components-library/kit";
import { HexValue } from "@/components/HexValue";
import { TimeAgo } from "@/components/TimeAgo";
import { getChainName } from "@/lib/chains";
import { getExplorerName, getExplorerTxUrl } from "@/lib/explorer";
import type { VeaEpochRow } from "@/lib/vea/types";

interface TimelineEvent {
  title: string;
  chainId: number;
  txHash: string;
  timestamp?: number;
  caller?: string;
}

interface VeaTimelineProps {
  row: VeaEpochRow;
}

/**
 * The epoch's on-chain events in order (snapshot saved, claimed, challenged, verification started, verified or
 * resolved, fallback) as a kit DataTable: step, chain, transaction (explorer link + copy), caller and age.
 */
export default function VeaTimeline({ row }: Readonly<VeaTimelineProps>) {
  const events = buildEvents(row);
  const columns: DataTableColumn<TimelineEvent>[] = [
    {
      key: "step",
      header: "Step",
      width: 200,
      render: (e) => <span className="font-semibold whitespace-nowrap">{e.title}</span>,
    },
    {
      key: "chain",
      header: "Chain",
      width: 200,
      render: (e) => <span className="whitespace-nowrap">{getChainName(e.chainId)}</span>,
    },
    {
      key: "tx",
      header: "Transaction",
      width: 260,
      render: (e) => (
        <HexValue
          variant="link"
          value={e.txHash}
          display={shortenAddress(e.txHash, 8)}
          copyLabel={`Copy the ${e.title} transaction hash`}
          href={getExplorerTxUrl(e.chainId, e.txHash)}
          explorerLabel={`View the ${e.title} transaction on ${getExplorerName(e.chainId)}`}
          className="whitespace-nowrap"
        />
      ),
    },
    {
      key: "by",
      header: "By",
      render: (e) =>
        e.caller ? (
          <span title={e.caller} className="font-mono whitespace-nowrap">
            {shortenAddress(e.caller)}
          </span>
        ) : (
          "—"
        ),
    },
    { key: "age", header: "When", align: "right", width: 140, render: (e) => <TimeAgo unixSeconds={e.timestamp} /> },
  ];

  return (
    <QueryState
      isLoading={false}
      data={events}
      empty={{ title: "No events yet", description: "No on-chain events recorded for this epoch yet." }}
    >
      {(list) => (
        <DataTable
          columns={columns}
          rows={list}
          rowKey={(e) => `${e.title}-${e.txHash}`}
          className="bg-klerosUIComponentsWhiteBackground"
        />
      )}
    </QueryState>
  );
}

function buildEvents(row: VeaEpochRow): TimelineEvent[] {
  const { snapshot, claim, route } = row;
  const events: TimelineEvent[] = [];

  if (snapshot?.txHash) {
    events.push({
      title: "Snapshot saved",
      chainId: route.sourceChainId,
      txHash: snapshot.txHash,
      timestamp: snapshot.timestamp,
      caller: snapshot.caller,
    });
  }
  if (claim?.txHash) {
    events.push({
      title: "Claimed",
      chainId: route.destinationChainId,
      txHash: claim.txHash,
      timestamp: claim.timestamp,
      caller: claim.bridger,
    });
  }
  const challenge = claim?.challenge[0];
  if (challenge) {
    events.push({
      title: "Challenged",
      chainId: route.destinationChainId,
      txHash: challenge.txHash,
      timestamp: challenge.timestamp,
      caller: challenge.challenger,
    });
  }
  const verification = claim?.verification[0];
  if (verification?.startTxHash) {
    events.push({
      title: "Verification started",
      chainId: route.destinationChainId,
      txHash: verification.startTxHash,
      timestamp: verification.startTimestamp,
      caller: verification.startCaller,
    });
  }
  if (verification?.verifiedTxHash) {
    events.push({
      title: challenge ? "Resolved" : "Verified",
      chainId: route.destinationChainId,
      txHash: verification.verifiedTxHash,
      timestamp: verification.verifiedTimestamp,
      caller: verification.verifiedCaller,
    });
  }
  const fallback = snapshot?.fallback[0];
  if (fallback) {
    events.push({
      title: "Fallback executed",
      chainId: route.sourceChainId,
      txHash: fallback.txHash,
      timestamp: fallback.timestamp,
      caller: fallback.executor,
    });
  }

  return events;
}

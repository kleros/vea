import { Copiable } from "@kleros/ui-components-library";
import ChainBadge from "@/components/ChainBadge";
import { getExplorerTxUrl } from "@/lib/explorer";
import { formatRelativeTime } from "@/lib/utils";
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

export default function VeaTimeline({ row }: Readonly<VeaTimelineProps>) {
  const events = buildEvents(row);

  if (events.length === 0) {
    return <p className="text-sm text-(--text-muted)">No on-chain events recorded for this epoch yet.</p>;
  }

  return (
    <ol className="space-y-4">
      {events.map((event, index) => {
        const explorerUrl = getExplorerTxUrl(event.chainId, event.txHash);
        return (
          <li
            key={`${event.title}-${event.txHash}`}
            className="flex items-start gap-4 animate-fade-in"
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            <div className="w-2.5 h-2.5 mt-1.5 rounded-full bg-purple-500 shrink-0" />
            <div className="flex-1 min-w-0 pb-4 border-b border-(--border) last:border-none">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-sm font-semibold">{event.title}</span>
                <ChainBadge chainId={event.chainId} />
              </div>
              <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-(--text-muted)">
                {explorerUrl ? (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-purple-400 hover:text-purple-300"
                  >
                    {event.txHash.slice(0, 10)}…{event.txHash.slice(-8)}
                  </a>
                ) : (
                  <Copiable copiableContent={event.txHash} info="Copy transaction hash">
                    <span className="font-mono">
                      {event.txHash.slice(0, 10)}…{event.txHash.slice(-8)}
                    </span>
                  </Copiable>
                )}
                {event.caller && (
                  <span className="font-mono">
                    {event.caller.slice(0, 6)}…{event.caller.slice(-4)}
                  </span>
                )}
                <span>{formatRelativeTime(event.timestamp)}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function buildEvents(row: VeaEpochRow): TimelineEvent[] {
  const { snapshot, claim, route } = row;
  const events: TimelineEvent[] = [];

  if (snapshot?.txHash) {
    events.push({
      title: "Snapshot Saved",
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
      title: "Verification Started",
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
      title: "Fallback Executed",
      chainId: route.sourceChainId,
      txHash: fallback.txHash,
      timestamp: fallback.timestamp,
      caller: fallback.executor,
    });
  }

  return events;
}

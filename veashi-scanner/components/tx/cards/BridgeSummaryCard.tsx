import type { Bridges } from "@kleros/veashi-sdk";
import { Message } from "@/lib/types";
import { getBridgeName } from "@/lib/veashiHelpers";
import BridgeBadge from "@/components/BridgeBadge";
import SectionCard from "./SectionCard";

export default function BridgeSummaryCard({ message }: { message: Message }) {
  const adapters = message.adapters ?? [];
  const reporters = message.reporters ?? [];

  const identifiedBridges = new Set<Bridges>();
  let hasUnidentified = false;

  adapters.forEach((addr) => {
    const bridge = getBridgeName(message.sourceChain, message.destinationChain, addr);
    if (bridge !== null) identifiedBridges.add(bridge);
    else hasUnidentified = true;
  });
  reporters.forEach((addr) => {
    const bridge = getBridgeName(message.sourceChain, message.destinationChain, undefined, addr);
    if (bridge !== null) identifiedBridges.add(bridge);
    else hasUnidentified = true;
  });

  const bridges = Array.from(identifiedBridges);
  const totalCount = bridges.length + (hasUnidentified ? 1 : 0);

  return (
    <SectionCard icon="bridge" label="Bridges" delay="0.13s">
      <div className="mt-4">
        <div className="flex items-baseline gap-1 mb-1">
          <span className="text-3xl font-bold font-mono">{totalCount}</span>
          <span className="text-(--text-muted) text-lg font-mono"> bridge{totalCount !== 1 ? "s" : ""}</span>
        </div>
        <div className="mb-3">
          <span className="text-xs font-medium text-(--text-secondary)">
            {totalCount === 0 ? "No adapters found" : "Active adapters"}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {totalCount === 0 ? (
            <p className="text-xs text-(--text-muted)">—</p>
          ) : (
            <>
              {bridges.map((bridge) => (
                <BridgeBadge key={bridge} bridge={bridge} />
              ))}
              {hasUnidentified && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-base text-xs font-mono font-medium border border-(--border) text-(--text-muted)">
                  Unknown
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

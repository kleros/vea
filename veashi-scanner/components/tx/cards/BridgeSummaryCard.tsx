import { Message } from "@/lib/types";
import { getBridgeName, getBridgeLabel } from "@/lib/veashiHelpers";
import type { Bridge } from "@/lib/types";
import BridgeBadge from "@/components/BridgeBadge";
import SectionCard from "./SectionCard";

export default function BridgeSummaryCard({ message }: { message: Message }) {
  const adapters = message.adapters ?? [];
  const reporters = message.reporters ?? [];

  const bridgeNames = new Set<string>();
  adapters.forEach((addr) => {
    const name = getBridgeName(message.sourceChain, message.destinationChain, addr);
    bridgeNames.add(name !== null ? getBridgeLabel(name) : "Unknown");
  });
  reporters.forEach((addr) => {
    const name = getBridgeName(message.sourceChain, message.destinationChain, undefined, addr);
    bridgeNames.add(name !== null ? getBridgeLabel(name) : "Unknown");
  });

  const bridges = Array.from(bridgeNames);
  const knownBridges: Bridge[] = ["CCIP", "LayerZero", "Vea", "DeBridge"];

  return (
    <SectionCard icon="bridge" label="Bridges" delay="0.13s">
      <div className="mt-4">
        <div className="flex items-baseline gap-1 mb-1">
          <span className="text-3xl font-bold font-mono">{bridges.length}</span>
          <span className="text-(--text-muted) text-lg font-mono"> bridge{bridges.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="mb-3">
          <span className="text-xs font-medium text-(--text-secondary)">
            {bridges.length === 0 ? "No adapters found" : "Active adapters"}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {bridges.length === 0 ? (
            <p className="text-xs text-(--text-muted)">—</p>
          ) : (
            bridges.map((name) =>
              knownBridges.includes(name as Bridge) ? (
                <BridgeBadge key={name} bridge={name as Bridge} />
              ) : (
                <span
                  key={name}
                  className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-medium border border-(--border) text-(--text-muted)"
                >
                  {name}
                </span>
              )
            )
          )}
        </div>
      </div>
    </SectionCard>
  );
}

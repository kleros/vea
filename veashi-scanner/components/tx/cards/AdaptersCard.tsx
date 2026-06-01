import { Message } from "@/lib/types";
import { getBridgeName } from "@/lib/veashiHelpers";
import SectionLabel from "../SectionLabel";
import CopyButton from "@/components/CopyButton";

export default function AdaptersCard({
  message,
  statuses,
  isLoading,
}: {
  message: Message;
  statuses: Record<string, any>;
  isLoading: boolean;
}) {
  const adapters = message.adapters ?? [];
  const reporters = message.reporters ?? [];

  if (adapters.length === 0 && reporters.length === 0) {
    return (
      <div className="glass rounded-xl border border-(--border) p-5 animate-fade-in" style={{ animationDelay: "0.2s" }}>
        <SectionLabel icon="bridge" label="Adapters & Reporters" />
        <p className="mt-4 text-xs text-(--text-muted)">Adapter data unavailable — not yet fetched from chain.</p>
      </div>
    );
  }

  // 1. Group the adapters and reporters by their bridge name
  const bridgeGroups = new Map<string, { adapter?: string; reporter?: string; status?: any; bridgeName: string }>();

  // Process Adapters
  adapters.forEach((addr) => {
    const bridge = getBridgeName(message.sourceChain, message.destinationChain, addr, undefined);
    const key = bridge !== null ? String(bridge) : `unknown-adapter-${addr}`;
    const current = bridgeGroups.get(key) || {
      bridgeName: bridge !== null ? String(bridge) : "Unknown",
    };

    bridgeGroups.set(key, {
      ...current,
      adapter: addr,
      status: statuses ? statuses[addr] : null,
    });
  });

  // Process Reporters
  reporters.forEach((addr) => {
    const bridge = getBridgeName(message.sourceChain, message.destinationChain, undefined, addr);
    const key = bridge !== null ? String(bridge) : `unknown-reporter-${addr}`;
    const current = bridgeGroups.get(key) || {
      bridgeName: bridge !== null ? String(bridge) : "Unknown",
    };

    bridgeGroups.set(key, {
      ...current,
      reporter: addr,
    });
  });

  const pairedData = Array.from(bridgeGroups.values());

  return (
    <div className="glass rounded-xl border border-(--border) p-5 animate-fade-in" style={{ animationDelay: "0.2s" }}>
      <SectionLabel icon="bridge" label="Adapters & Reporters" />

      <div className="mt-4 space-y-3">
        {pairedData.map((pair, idx) => (
          <div
            key={idx}
            className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-(--surface) rounded-lg px-4 py-3 border border-(--border)"
          >
            {/* Left Side: Bridge Name & Addresses mapped in a row */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
              {/* Bridge Name (Fixed width to keep rows aligned) */}
              <div className="w-24 shrink-0">
                <span className="text-xs font-bold uppercase tracking-wider text-(--text-primary)">
                  {pair.bridgeName}
                </span>
              </div>

              {/* Addresses (Side-by-side with flex-wrap) */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {pair.adapter && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
                      Adapter
                    </span>
                    <CopyButton
                      text={pair.adapter}
                      displayText={`${pair.adapter.slice(0, 10)}…${pair.adapter.slice(-8)}`}
                      className="font-mono text-xs bg-(--background) px-2 py-1 rounded"
                    />
                  </div>
                )}

                {pair.reporter && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
                      Reporter
                    </span>
                    <CopyButton
                      text={pair.reporter}
                      displayText={`${pair.reporter.slice(0, 10)}…${pair.reporter.slice(-8)}`}
                      className="font-mono text-xs bg-(--background) px-2 py-1 rounded"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Right Side: Shared Confirmation Status */}
            <div className="shrink-0 pt-3 lg:pt-0 border-t border-(--border) lg:border-0 flex items-center">
              {isLoading ? (
                <span className="text-xs font-medium text-(--text-muted) animate-pulse">Loading...</span>
              ) : pair.status === "Verified" || pair.status === true ? (
                <span className="text-xs font-medium text-green-400">Verified</span>
              ) : pair.status === "Failed" || pair.status === false ? (
                <span className="text-xs font-medium text-red-400">Failed</span>
              ) : (
                <span className="text-xs font-medium text-amber-400/80">{pair.status || "Pending"}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

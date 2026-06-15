import { Message } from "@/lib/types";
import { getBridgeName } from "@/lib/veashiHelpers";
import { Copiable } from "@kleros/ui-components-library";
import SectionCard from "./SectionCard";

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
      <SectionCard icon="bridge" label="Adapters & Reporters" delay="0.2s">
        <p className="mt-4 text-xs text-(--text-muted)">Adapter data unavailable — not yet fetched from chain.</p>
      </SectionCard>
    );
  }

  const bridgeGroups = new Map<string, { adapter?: string; reporter?: string; status?: any; bridgeName: string }>();

  // Adapters and reporters are index-aligned: adapters[i] and reporters[i]
  // belong to the same bridge. Process them together so they stay paired even
  // when the bridge can't be identified.
  const pairCount = Math.max(adapters.length, reporters.length);
  for (let i = 0; i < pairCount; i++) {
    const adapter = adapters[i];
    const reporter = reporters[i];

    const bridge = getBridgeName(message.sourceChain, message.destinationChain, adapter, reporter);
    // When the bridge is unknown, key by index so the paired adapter/reporter
    // share a single group instead of splitting into separate boxes.
    const key = bridge !== null ? String(bridge) : `unknown-${i}`;
    const current = bridgeGroups.get(key) || {
      bridgeName: bridge !== null ? String(bridge) : "Unknown",
    };

    bridgeGroups.set(key, {
      ...current,
      adapter: adapter ?? current.adapter,
      reporter: reporter ?? current.reporter,
      status: adapter && statuses ? statuses[adapter] : current.status,
    });
  }

  const pairedData = Array.from(bridgeGroups.values());

  return (
    <SectionCard icon="bridge" label="Adapters & Reporters" delay="0.2s">
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
                    <Copiable copiableContent={pair.adapter} info="Copy adapter address">
                      <span className="font-mono text-sm break-all">{pair.adapter}</span>
                    </Copiable>
                  </div>
                )}

                {pair.reporter && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
                      Reporter
                    </span>
                    <Copiable copiableContent={pair.reporter} info="Copy reporter address">
                      <span className="font-mono text-sm break-all">{pair.reporter}</span>
                    </Copiable>
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
    </SectionCard>
  );
}

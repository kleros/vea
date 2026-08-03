import { Message, StatusesRecord, Status } from "@/lib/types";
import { getBridgeName, getBridgeLabel } from "@/lib/veashiHelpers";
import { Copiable } from "@kleros/ui-components-library";
import RpcErrorNote from "@/components/tx/RpcErrorNote";
import SectionCard from "./SectionCard";

function getStatusDisplay(status: Status | undefined, isLoading: boolean, hasError: boolean) {
  if (isLoading) return { label: "Loading...", className: "text-(--text-muted) animate-pulse" };
  if (status === Status.CONFIRMED) return { label: "Confirmed", className: "text-green-400" };
  if (status === Status.PENDING) return { label: "Pending", className: "text-red-400" };
  // No status yet (never successfully fetched) and the last poll errored —
  // "Pending" would wrongly read as a confirmed real state; we just don't know yet.
  if (!status && hasError) return { label: "Checking…", className: "text-amber-400/80 animate-pulse" };
  return { label: status || Status.PENDING, className: "text-amber-400/80" };
}

export default function AdaptersCard({
  message,
  statuses,
  isLoading,
  error,
}: Readonly<{
  message: Message;
  statuses: StatusesRecord;
  isLoading: boolean;
  error?: Error | null;
}>) {
  const adapters = message.adapters ?? [];
  const reporters = message.reporters ?? [];

  if (adapters.length === 0 && reporters.length === 0) {
    return (
      <SectionCard icon="bridge" label="Adapters & Reporters" delay="0.2s">
        <p className="mt-4 text-xs text-(--text-muted)">Adapter data unavailable — not yet fetched from chain.</p>
      </SectionCard>
    );
  }

  const bridgeGroups = new Map<string, { adapter?: string; reporter?: string; status?: Status; bridgeName: string }>();

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
    const key = bridge !== null ? bridge : `unknown-${i}`;
    const current = bridgeGroups.get(key) || {
      bridgeName: bridge !== null ? getBridgeLabel(bridge) : "Unknown",
    };

    bridgeGroups.set(key, {
      ...current,
      adapter: adapter ?? current.adapter,
      reporter: reporter ?? current.reporter,
      status: adapter && statuses ? statuses[adapter] : current.status,
    });
  }

  // Keep the Map keys ("ccip"/"lz"/"vea" or "unknown-{i}") — they're stable and
  // unique per group, so React rows stay bound to the right group if ordering changes.
  const pairedData = Array.from(bridgeGroups.entries());

  return (
    <SectionCard icon="bridge" label="Adapters & Reporters" delay="0.2s">
      <div className="mt-4 space-y-3">
        {pairedData.map(([groupKey, pair]) => {
          const statusDisplay = getStatusDisplay(pair.status, isLoading, !!error);

          return (
            <div
              key={groupKey}
              className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-(--surface) rounded-base px-4 py-3 border border-(--border)"
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
                <span className={`text-xs font-medium ${statusDisplay.className}`}>{statusDisplay.label}</span>
              </div>
            </div>
          );
        })}
      </div>
      {error && <RpcErrorNote />}
    </SectionCard>
  );
}

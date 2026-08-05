import { Message, Status, StatusesRecord } from "@/lib/types";
import { getStatusMeta } from "@/lib/utils";
import RpcErrorNote from "@/components/tx/RpcErrorNote";
import SectionCard from "./SectionCard";
export default function ThresholdCard({
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
  const required = message.thresholdRequired;
  const verifiedCount = statuses ? Object.values(statuses).filter((s) => s === Status.CONFIRMED).length : 0;
  const current = isLoading ? message.thresholdCurrent ?? 0 : verifiedCount;

  const pct = required > 0 ? Math.round((current / required) * 100) : 0;
  const { label, dotClass, barClass } = getStatusMeta(current, required);

  // With no confirmations yet, "Pending" reads as a confirmed real state —
  // but if the last poll errored, we don't actually know that yet. Only
  // override when current is 0: once we have at least one real confirmation,
  // that data is accurate (merged, never downgraded), so show it as-is.
  const unknownDueToError = !isLoading && !!error && current === 0;

  const displayLabel = isLoading ? "Verifying..." : unknownDueToError ? "Checking…" : label;
  const displayDotClass = isLoading
    ? "bg-purple-400 animate-pulse"
    : unknownDueToError
    ? "bg-amber-400 animate-pulse"
    : dotClass;

  return (
    <SectionCard icon="threshold" label="Threshold" delay="0.1s">
      <div className="mt-4">
        <div className="flex items-baseline gap-1 mb-1">
          <span className="text-3xl font-bold font-mono">{current}</span>
          <span className="text-(--text-muted) text-lg font-mono">/{required}</span>
        </div>
        <div className="flex items-center gap-1.5 mb-3">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${displayDotClass}`} />
          <span className="text-xs font-medium text-(--text-secondary)">{displayLabel}</span>
        </div>
        <div className="h-1.5 rounded-full bg-(--surface) overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              isLoading ? "bg-purple-400/50 animate-pulse" : barClass
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-(--text-muted) mt-1.5">{pct}% met</p>
        {error && <RpcErrorNote />}
      </div>
    </SectionCard>
  );
}

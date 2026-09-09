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
  const achieved = isLoading ? message.thresholdCurrent ?? 0 : verifiedCount;

  const pct = required > 0 ? Math.round((achieved / required) * 100) : 0;
  const { label, dotClass, barClass } = getStatusMeta(achieved, required);
  const unknownDueToError = !isLoading && !!error && achieved === 0;

  const displayLabel = isLoading ? "Verifying..." : unknownDueToError ? "Checking…" : label;
  const displayDotClass = isLoading
    ? "bg-purple-400 animate-pulse"
    : unknownDueToError
    ? "bg-amber-400 animate-pulse"
    : dotClass;

  return (
    <SectionCard icon="threshold" label="Consensus" delay="0.1s">
      <div className="mt-4">
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-(--text-muted) mb-1">Required</p>
            <p className="text-2xl font-bold font-mono">{required}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-(--text-muted) mb-1">Achieved</p>
            <p className="text-2xl font-bold font-mono">{achieved}</p>
          </div>
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

import { Message, Status, StatusesRecord } from "@/lib/types";
import { getStatusMeta } from "@/lib/utils";
import SectionCard from "./SectionCard";
export default function ThresholdCard({
  message,
  statuses,
  isLoading,
}: Readonly<{
  message: Message;
  statuses: StatusesRecord;
  isLoading: boolean;
}>) {
  const required = message.thresholdRequired;
  const verifiedCount = statuses ? Object.values(statuses).filter((s) => s === Status.CONFIRMED).length : 0;
  const current = isLoading ? message.thresholdCurrent ?? 0 : verifiedCount;

  const pct = required > 0 ? Math.round((current / required) * 100) : 0;
  const { label, dotClass, barClass } = getStatusMeta(current, required);
  const displayLabel = isLoading ? "Verifying..." : label;
  const displayDotClass = isLoading ? "bg-purple-400 animate-pulse" : dotClass;

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
      </div>
    </SectionCard>
  );
}

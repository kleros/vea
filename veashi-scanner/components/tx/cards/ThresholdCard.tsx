import { Message } from "@/lib/types";
import SectionLabel from "../SectionLabel";
import { getStatusMeta } from "@/lib/utils";
export default function ThresholdCard({
  message,
  statuses,
  isLoading,
}: {
  message: Message;
  statuses: Record<string, any>; // Adjust this type to match your hook!
  isLoading: boolean;
}) {
  const required = message.thresholdRequired;

  // Dynamically calculate the current threshold from the hook's statuses.
  // Assuming a value of true, "Verified", or "Success" means it passed.
  const verifiedCount = statuses ? Object.values(statuses).filter((s) => s === "Confirmed" || s === true).length : 0;

  // Fallback to message.thresholdCurrent if the hook is still loading,
  // otherwise use our live verified count.
  const current = isLoading ? message.thresholdCurrent ?? 0 : verifiedCount;

  const pct = required > 0 ? Math.round((current / required) * 100) : 0;

  // Optional: tweak the status meta if it's currently loading
  const { label, dotClass, barClass } = getStatusMeta(current, required);
  const displayLabel = isLoading ? "Verifying..." : label;
  const displayDotClass = isLoading ? "bg-purple-400 animate-pulse" : dotClass;

  return (
    <div className="glass rounded-xl border border-(--border) p-5 animate-fade-in" style={{ animationDelay: "0.1s" }}>
      <SectionLabel icon="threshold" label="Threshold" />
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
    </div>
  );
}

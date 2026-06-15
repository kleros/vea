import { CircularProgress } from "@kleros/ui-components-library";

interface StatusIndicatorProps {
  current: number;
  required: number;
  size?: "sm" | "md" | "lg";
}

const STATUS_STYLES = {
  complete: {
    label: "Complete",
    bg: "bg-(--klerosUIComponentsSuccessLight)",
    text: "text-(--klerosUIComponentsSuccess)",
  },
  inProgress: {
    label: "In Progress",
    bg: "bg-(--klerosUIComponentsWarningLight)",
    text: "text-(--klerosUIComponentsWarning)",
  },
  pending: {
    label: "Pending",
    bg: "bg-(--klerosUIComponentsErrorLight)",
    text: "text-(--klerosUIComponentsError)",
  },
} as const;

export default function StatusIndicator({ current, required, size = "md" }: StatusIndicatorProps) {
  const percentage = Math.min(100, (current / required) * 100);
  const status = current >= required ? "complete" : current > 0 ? "inProgress" : "pending";
  const s = STATUS_STYLES[status];

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <CircularProgress
          value={percentage}
          minValue={0}
          maxValue={100}
          small={size === "sm"}
          animated
          aria-label={`${current} of ${required}`}
        />
        {/* Optional center label if CircularProgress doesn't show one */}
      </div>

      <div className="flex flex-col gap-1 items-start">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>{s.label}</span>
        <span className="text-xs text-(--klerosUIComponentsSecondaryText)">
          {current}/{required} · {Math.round(percentage)}% threshold
        </span>
      </div>
    </div>
  );
}

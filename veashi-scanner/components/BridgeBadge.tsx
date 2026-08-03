import type { Bridges } from "@kleros/veashi-sdk";
import { getBridgeLabel, getBridgeColors } from "@/lib/veashiHelpers";

interface BridgeBadgeProps {
  bridge: Bridges;
  className?: string;
}

export default function BridgeBadge({ bridge, className = "" }: BridgeBadgeProps) {
  const colors = getBridgeColors(bridge);
  const label = getBridgeLabel(bridge);

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-base text-xs font-mono font-medium border ${className}`}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        borderColor: colors.border,
      }}
    >
      {label}
    </span>
  );
}

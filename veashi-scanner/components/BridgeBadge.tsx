import { Bridge } from "@/lib/types";

const bridgeColors: Record<Bridge, { bg: string; text: string; border: string }> = {
  CCIP: {
    bg: "rgba(55, 115, 255, 0.1)",
    text: "#3773FF",
    border: "rgba(55, 115, 255, 0.3)",
  },
  LayerZero: {
    bg: "rgba(255, 255, 255, 0.08)",
    text: "#FFFFFF",
    border: "rgba(255, 255, 255, 0.2)",
  },
  Vea: {
    bg: "rgba(236, 72, 153, 0.1)",
    text: "#EC4899",
    border: "rgba(236, 72, 153, 0.3)",
  },
  DeBridge: {
    bg: "rgba(103, 230, 220, 0.1)",
    text: "#67E6DC",
    border: "rgba(103, 230, 220, 0.3)",
  },
};

interface BridgeBadgeProps {
  bridge: Bridge;
  className?: string;
}

export default function BridgeBadge({ bridge, className = "" }: BridgeBadgeProps) {
  const colors = bridgeColors[bridge];

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-medium border ${className}`}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        borderColor: colors.border,
      }}
    >
      {bridge}
    </span>
  );
}

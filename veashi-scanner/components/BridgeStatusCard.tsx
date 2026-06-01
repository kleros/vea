"use client";

import { BridgeStatus } from "@/lib/types";

const bridgeColors: Record<BridgeStatus["name"], { bg: string; text: string; border: string }> = {
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

interface BridgeStatusCardProps {
  status: BridgeStatus;
}

export default function BridgeStatusCard({ status }: BridgeStatusCardProps) {
  const colors = bridgeColors[status.name];

  const getTimeAgo = (timestamp?: number) => {
    if (!timestamp) return null;
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg border transition-all hover-lift"
      style={{
        backgroundColor: colors.bg,
        borderColor: colors.border,
      }}
    >
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${status.completed ? "bg-green-400 animate-glow" : "bg-amber-400"}`} />
        <div>
          <div className="font-mono font-medium text-sm" style={{ color: colors.text }}>
            {status.name}
          </div>
          {status.completed && status.timestamp && (
            <div className="text-xs text-[var(--text-muted)] mt-0.5">{getTimeAgo(status.timestamp)}</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {status.completed ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-400/10 border border-green-400/20">
            <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-xs font-medium text-green-400">Completed</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-400/10 border border-amber-400/20">
            <svg className="w-3.5 h-3.5 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span className="text-xs font-medium text-amber-400">Pending</span>
          </div>
        )}
      </div>
    </div>
  );
}

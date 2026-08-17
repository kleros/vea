import type { VeaStatus } from "@/lib/vea/types";

const STATUS_STYLES: Record<VeaStatus, { bg: string; text: string }> = {
  Saved: { bg: "bg-(--klerosUIComponentsWarningLight)", text: "text-(--klerosUIComponentsWarning)" },
  Claimed: { bg: "bg-(--surface)", text: "text-(--text-secondary)" },
  Challenged: { bg: "bg-(--klerosUIComponentsErrorLight)", text: "text-(--klerosUIComponentsError)" },
  Verifying: { bg: "bg-purple-700/20", text: "text-purple-400" },
  Verified: { bg: "bg-(--klerosUIComponentsSuccessLight)", text: "text-(--klerosUIComponentsSuccess)" },
  Resolved: { bg: "bg-pink-600/20", text: "text-pink-400" },
};

interface VeaStatusBadgeProps {
  status: VeaStatus;
}

export default function VeaStatusBadge({ status }: Readonly<VeaStatusBadgeProps>) {
  const style = STATUS_STYLES[status];
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${style.bg} ${style.text}`}>
      {status}
    </span>
  );
}

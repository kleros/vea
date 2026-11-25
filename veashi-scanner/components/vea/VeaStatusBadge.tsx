import { StatusBadge, type Tone } from "@kleros/ui-components-library/kit";
import type { VeaStatus } from "@/lib/vea/types";

/** Each epoch status's tone, text and explanation (the badge's title). */
const VIEW: Record<VeaStatus, { tone: Tone; text: string; title: string }> = {
  Pending: { tone: "warning", text: "Pending", title: "The snapshot is not saved yet, or is being resolved." },
  Saved: {
    tone: "neutral",
    text: "Saved",
    title: "The snapshot is saved on the source chain; nobody has claimed it yet.",
  },
  Claimed: { tone: "info", text: "Claimed", title: "A bridger claimed the state root on the destination chain." },
  Challenged: { tone: "error", text: "Challenged", title: "The claim was challenged." },
  Verifying: { tone: "accent", text: "Verifying", title: "Verification of the claim has started." },
  Verified: { tone: "success", text: "Verified", title: "The claim was verified." },
  Resolved: { tone: "success", text: "Resolved", title: "The claim was challenged, then resolved." },
  Unknown: { tone: "neutral", text: "Not checked", title: "The claim query failed, so no status is shown." },
};

interface VeaStatusBadgeProps {
  status: VeaStatus;
}

/**
 * An epoch's status as a kit StatusBadge. "Unknown" (`fetchEpochs` gives it when the claim query failed) reads "Not
 * checked", as on the other pages.
 */
export default function VeaStatusBadge({ status }: Readonly<VeaStatusBadgeProps>) {
  const view = VIEW[status];
  return (
    <StatusBadge tone={view.tone} title={view.title} className="whitespace-nowrap">
      {view.text}
    </StatusBadge>
  );
}

import { Message } from "@/lib/types";
import SectionCard from "./SectionCard";

export default function DetailsCard({
  message,
  execStatus,
  execLoading,
}: {
  message: Message;
  execStatus: "pending" | "executed" | "failed";
  execLoading: boolean;
}) {
  const execution = getExecutionDisplay(execLoading, execStatus);

  return (
    <SectionCard icon="info" label="Details" delay="0.15s">
      <dl className="mt-4 space-y-3">
        {message.messageId && (
          <MetaRow label="Message ID">
            <span className="font-mono text-xs break-all text-right">{message.messageId}</span>
          </MetaRow>
        )}
        {message.adapters && (
          <MetaRow label="Adapters">
            <span className="font-mono text-sm">{message.adapters.length}</span>
          </MetaRow>
        )}
        {message.reporters && (
          <MetaRow label="Reporters">
            <span className="font-mono text-sm">{message.reporters.length}</span>
          </MetaRow>
        )}
        <MetaRow label="Execution">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full inline-block ${execution.dotClassName}`} />
            <span className="text-sm font-mono">{execution.text}</span>
          </div>
        </MetaRow>
      </dl>
    </SectionCard>
  );
}

function getExecutionDisplay(execLoading: boolean, execStatus: "pending" | "executed" | "failed") {
  if (execLoading) {
    return { dotClassName: "bg-purple-400 animate-pulse", text: "Checking…" };
  }
  if (execStatus === "executed") {
    return { dotClassName: "bg-green-400", text: "Executed" };
  }
  if (execStatus === "failed") {
    return { dotClassName: "bg-red-400", text: "Failed" };
  }
  return { dotClassName: "bg-amber-400 animate-pulse", text: "Pending" };
}

function MetaRow({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs text-(--text-muted) uppercase tracking-wide shrink-0 mt-0.5">{label}</dt>
      <dd className="text-right flex flex-col items-end gap-0.5 min-w-0">{children}</dd>
    </div>
  );
}

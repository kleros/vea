import { Message } from "@/lib/types";
import SectionLabel from "../SectionLabel";

export default function DetailsCard({
  message,
  execStatus,
  execLoading,
}: {
  message: Message;
  execStatus: "pending" | "executed" | "failed";
  execLoading: boolean;
}) {
  return (
    <div className="glass rounded-xl border border-(--border) p-5 animate-fade-in" style={{ animationDelay: "0.15s" }}>
      <SectionLabel icon="info" label="Details" />
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
            {execLoading ? (
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse inline-block" />
            ) : execStatus === "executed" ? (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
            ) : execStatus === "failed" ? (
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
            )}
            <span className="text-sm font-mono">
              {execLoading
                ? "Checking…"
                : execStatus === "executed"
                ? "Executed"
                : execStatus === "failed"
                ? "Failed"
                : "Pending"}
            </span>
          </div>
        </MetaRow>
      </dl>
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs text-(--text-muted) uppercase tracking-wide shrink-0 mt-0.5">{label}</dt>
      <dd className="text-right flex flex-col items-end gap-0.5 min-w-0">{children}</dd>
    </div>
  );
}

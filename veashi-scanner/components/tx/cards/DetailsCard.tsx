import { Message } from "@/lib/types";
import { Copiable } from "@kleros/ui-components-library";
import RpcErrorNote from "@/components/tx/RpcErrorNote";
import SectionCard from "./SectionCard";

/** Hex payloads longer than this are truncated with a leading/trailing snippet; full value stays copiable. */
const DATA_TRUNCATE_LENGTH = 22;

export default function DetailsCard({
  message,
  execStatus,
  execLoading,
  execError,
}: {
  message: Message;
  execStatus: "pending" | "executed";
  execLoading: boolean;
  execError?: Error | null;
}) {
  const execution = getExecutionDisplay(execLoading, execStatus);
  const hasData = !!message.data && message.data !== "0x";

  return (
    <SectionCard icon="info" label="Details" delay="0.15s">
      <div className="mt-4 space-y-3">
        {message.messageId && (
          <FieldBox label="Message ID">
            <Copiable copiableContent={message.messageId} info="Copy message ID">
              <span className="font-mono text-sm break-all">{message.messageId}</span>
            </Copiable>
          </FieldBox>
        )}
        {message.data !== undefined && (
          <FieldBox label="Message Data">
            {hasData ? (
              <Copiable copiableContent={message.data} info="Copy message data">
                <span className="font-mono text-sm break-all">
                  {message.data.length > DATA_TRUNCATE_LENGTH
                    ? `${message.data.slice(0, 14)}…${message.data.slice(-8)}`
                    : message.data}
                </span>
              </Copiable>
            ) : (
              <span className="font-mono text-sm text-(--text-muted)">Empty</span>
            )}
          </FieldBox>
        )}
        <dl>
          <MetaRow label="Execution">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${execution.dotClassName}`} />
              <span className="text-sm font-mono">{execution.text}</span>
            </div>
          </MetaRow>
        </dl>
        {execError && <RpcErrorNote />}
      </div>
    </SectionCard>
  );
}

function getExecutionDisplay(execLoading: boolean, execStatus: "pending" | "executed") {
  if (execLoading) {
    return { dotClassName: "bg-purple-400 animate-pulse", text: "Checking…" };
  }
  if (execStatus === "executed") {
    return { dotClassName: "bg-green-400", text: "Executed" };
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

function FieldBox({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div>
      <p className="text-xs text-(--text-muted) uppercase tracking-wide mb-1">{label}</p>
      <div className="bg-(--surface) rounded-base px-3 py-2 border border-(--border)">{children}</div>
    </div>
  );
}

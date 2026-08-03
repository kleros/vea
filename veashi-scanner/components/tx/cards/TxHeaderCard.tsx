import type { Message } from "@/lib/types";
import { Copiable } from "@kleros/ui-components-library";
import SectionCard from "./SectionCard";

export default function TxHeaderCard({
  message,
  source,
  txHash,
}: Readonly<{
  message: Message;
  source: "cache" | "chain" | null;
  txHash: string;
}>) {
  return (
    <SectionCard delay="0.05s">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-(--text-muted) mb-1.5">
            Source Transaction
          </p>
          <Copiable copiableContent={txHash} info="Copy transaction hash">
            <span className="font-mono text-sm break-all">{txHash}</span>
          </Copiable>
        </div>
        {source && (
          <span
            className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
              source === "cache" ? "bg-purple-500/10 text-purple-400" : "bg-blue-500/10 text-blue-400"
            }`}
          >
            {source === "cache" ? "Cached" : "On-chain"}
          </span>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-(--border) flex flex-wrap gap-x-6 gap-y-1">
        <span className="text-xs text-(--text-muted)">
          Block <span className="font-mono text-(--text-primary)">#{message.blockNumber.toLocaleString()}</span>
        </span>
        {message.nonce !== undefined && (
          <span className="text-xs text-(--text-muted)">
            Nonce <span className="font-mono text-(--text-primary)">{message.nonce}</span>
          </span>
        )}
        {message.messageId && (
          <span className="text-xs text-(--text-muted) min-w-0 truncate">
            ID <span className="font-mono text-(--text-primary)">{message.messageId.slice(0, 18)}…</span>
          </span>
        )}
      </div>
    </SectionCard>
  );
}

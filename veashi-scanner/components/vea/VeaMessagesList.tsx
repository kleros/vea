import { Copiable } from "@kleros/ui-components-library";
import { getExplorerTxUrl } from "@/lib/explorer";
import { formatRelativeTime } from "@/lib/utils";
import type { VeaMessageRow } from "@/lib/vea/types";

interface VeaMessagesListProps {
  messages: VeaMessageRow[];
  sourceChainId: number;
}

export default function VeaMessagesList({ messages, sourceChainId }: Readonly<VeaMessagesListProps>) {
  if (messages.length === 0) {
    return (
      <div className="glass border border-(--border) py-10 text-center">
        <p className="text-(--text-muted) text-sm">No messages in this snapshot.</p>
      </div>
    );
  }

  return (
    <div className="glass overflow-hidden border border-(--border)">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-(--border) bg-(--surface)">
              {["Nonce", "From", "To", "Transaction", "Status", "Timestamp"].map((col) => (
                <th
                  key={col}
                  className="px-6 py-3 text-left text-xs font-semibold text-(--text-muted) uppercase tracking-wider"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-(--border)">
            {messages.map((message) => {
              const explorerUrl = getExplorerTxUrl(sourceChainId, message.txHash);
              return (
                <tr key={message.id} className="animate-fade-in">
                  <td className="px-6 py-3 font-mono text-sm text-(--text-secondary)">#{message.nonce}</td>
                  <td className="px-6 py-3 font-mono text-xs">
                    {message.from.slice(0, 6)}…{message.from.slice(-4)}
                  </td>
                  <td className="px-6 py-3 font-mono text-xs">
                    {message.to.slice(0, 6)}…{message.to.slice(-4)}
                  </td>
                  <td className="px-6 py-3">
                    {explorerUrl ? (
                      <a
                        href={explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-purple-400 hover:text-purple-300"
                      >
                        {message.txHash.slice(0, 10)}…{message.txHash.slice(-8)}
                      </a>
                    ) : (
                      <Copiable copiableContent={message.txHash} info="Copy transaction hash">
                        <span className="font-mono text-xs">
                          {message.txHash.slice(0, 10)}…{message.txHash.slice(-8)}
                        </span>
                      </Copiable>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                        message.executed
                          ? "bg-(--klerosUIComponentsSuccessLight) text-(--klerosUIComponentsSuccess)"
                          : "bg-(--klerosUIComponentsWarningLight) text-(--klerosUIComponentsWarning)"
                      }`}
                    >
                      {message.executed ? "Executed" : "Pending"}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-(--text-secondary)">{formatRelativeTime(message.timestamp)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

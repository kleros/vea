import { Button, Copiable } from "@kleros/ui-components-library";
import { useNavigate, useParams } from "react-router-dom";
import Header from "@/components/Header";
import { useTransaction } from "@/hooks/useTransaction";
import TxDetailContent from "@/components/tx/TxDetailContent";

export default function TransactionPage() {
  const navigate = useNavigate();
  // Catch-all route "/tx/*" → segments are "{chainId}/{txHash}" or "{txHash}".
  const splat = useParams()["*"] ?? "";
  const segments = splat.split("/").filter(Boolean);

  const hasChainId = segments.length >= 2;
  const chainId = hasChainId ? Number(segments[0]) : null;
  const txHash = hasChainId ? segments[1] : segments[0];

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        <Button
          variant="secondary"
          small
          onPress={() => navigate("/")}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          }
          text="Back to Messages"
        />

        {/* No chainId: show informational message */}
        {!hasChainId ? (
          <>
            <div
              className="glass rounded-xl border border-(--border) p-5 animate-fade-in"
              style={{ animationDelay: "0.05s" }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-(--text-muted) mb-1">
                Source Transaction
              </p>
              <Copiable copiableContent={txHash} info="Copy transaction hash">
                <span className="font-mono text-sm break-all">{txHash}</span>
              </Copiable>
            </div>
            <NoChainIdCard />
          </>
        ) : (
          <TxDetail chainId={chainId!} txHash={txHash} />
        )}
      </main>
    </div>
  );
}

// ─── No-chainId fallback ───────────────────────────────────────────────────────

function NoChainIdCard() {
  return (
    <div
      className="glass rounded-xl border border-(--border) p-10 text-center animate-fade-in"
      style={{ animationDelay: "0.1s" }}
    >
      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
        <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <p className="text-sm font-medium mb-1">Source chain required</p>
      <p className="text-xs text-(--text-muted) max-w-xs mx-auto">
        Navigate to this transaction from the messages table, which includes the source chain ID in the URL
        (/tx/chainId/hash).
      </p>
    </div>
  );
}

// ─── Main Data Fetcher ────────────────────────────────────────────────────────
function TxDetail({ chainId, txHash }: Readonly<{ chainId: number; txHash: string }>) {
  const { message, isLoading, error, source } = useTransaction(chainId, txHash);

  if (isLoading) {
    return (
      <div className="glass rounded-xl border border-(--border) p-10 text-center animate-fade-in">
        <p className="text-sm text-(--text-muted)">Loading transaction…</p>
      </div>
    );
  }

  if (error || !message) {
    return (
      <div className="glass rounded-xl border border-red-500/20 p-10 text-center animate-fade-in">
        <p className="text-sm font-medium text-red-400 mb-1">Not found</p>
        <p className="text-xs text-(--text-muted)">{error ?? "Transaction could not be loaded."}</p>
      </div>
    );
  }

  return <TxDetailContent message={message} source={source} txHash={txHash} />;
}

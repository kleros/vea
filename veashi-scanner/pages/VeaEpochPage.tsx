import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@kleros/ui-components-library";
import Header from "@/components/Header";
import SectionCard from "@/components/tx/cards/SectionCard";
import ChainBadge from "@/components/ChainBadge";
import VeaStatusBadge from "@/components/vea/VeaStatusBadge";
import VeaTimeline from "@/components/vea/VeaTimeline";
import VeaMessagesList from "@/components/vea/VeaMessagesList";
import { getVeaRoute } from "@/lib/vea/config";
import { useVeaEpoch } from "@/hooks/useVeaEpoch";
import type { VeaBridgeKey, VeaNetwork, VeaRoute } from "@/lib/vea/types";

export default function VeaEpochPage() {
  const navigate = useNavigate();
  const params = useParams<{ bridgeKey: string; network: string; epoch: string }>();

  const bridgeKey = params.bridgeKey as VeaBridgeKey;
  const network = params.network as VeaNetwork;
  const epoch = Number(params.epoch);
  const route = getVeaRoute(bridgeKey, network);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        <Button
          variant="secondary"
          small
          onPress={() => navigate("/vea")}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          }
          text="Back to Vea Epochs"
        />

        {!route || Number.isNaN(epoch) ? <InvalidParamsCard /> : <EpochDetail route={route} epoch={epoch} />}
      </main>
    </div>
  );
}

function InvalidParamsCard() {
  return (
    <div className="glass border border-red-500/20 p-10 text-center animate-fade-in">
      <p className="text-sm font-medium text-red-400 mb-1">Invalid epoch link</p>
      <p className="text-xs text-(--text-muted)">The bridge, network, or epoch in this URL is not recognized.</p>
    </div>
  );
}

function EpochDetail({ route, epoch }: Readonly<{ route: VeaRoute; epoch: number }>) {
  const { row, messages, isLoading, error } = useVeaEpoch(route, epoch);

  if (isLoading) {
    return (
      <div className="glass border border-(--border) p-10 text-center animate-fade-in">
        <p className="text-sm text-(--text-muted)">Loading epoch…</p>
      </div>
    );
  }

  if (error || !row) {
    return (
      <div className="glass border border-red-500/20 p-10 text-center animate-fade-in">
        <p className="text-sm font-medium text-red-400 mb-1">Not found</p>
        <p className="text-xs text-(--text-muted)">{error ?? "This epoch could not be loaded."}</p>
      </div>
    );
  }

  return (
    <>
      <SectionCard delay="0.05s">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <ChainBadge chainId={route.sourceChainId} />
            <svg className="w-4 h-4 text-purple-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <ChainBadge chainId={route.destinationChainId} />
            <span className="font-mono text-sm text-(--text-secondary)">Epoch #{epoch}</span>
          </div>
          <VeaStatusBadge status={row.status} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-(--text-muted) mb-1">State Root</p>
            <p className="font-mono text-xs break-all">{row.snapshot?.stateRoot ?? row.claim?.stateRoot ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-(--text-muted) mb-1">Messages</p>
            <p className="font-mono text-xs">{row.snapshot?.numberMessages ?? messages.length}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard label="Lifecycle" icon="info" delay="0.1s">
        <VeaTimeline row={row} />
      </SectionCard>

      <SectionCard label="Messages" icon="route" delay="0.15s">
        <VeaMessagesList messages={messages} />
      </SectionCard>
    </>
  );
}

import { useParams } from "react-router-dom";
import { Card } from "@kleros/ui-components-library";
import { EmptyState, Inline, KeyValueList, Page, QueryState, Section, Stack } from "@kleros/ui-components-library/kit";
import { BackBreadcrumb } from "@/components/BackBreadcrumb";
import { ChainRoute } from "@/components/ChainRoute";
import { HexValue } from "@/components/HexValue";
import { TimeAgo } from "@/components/TimeAgo";
import VeaStatusBadge from "@/components/vea/VeaStatusBadge";
import VeaTimeline from "@/components/vea/VeaTimeline";
import VeaMessagesList from "@/components/vea/VeaMessagesList";
import { useRelativeTimeTick } from "@/hooks/useRelativeTimeTick";
import { useVeaEpoch } from "@/hooks/useVeaEpoch";
import { formatUtcFull } from "@/lib/format";
import { getVeaRoute } from "@/lib/vea/config";
import type { VeaBridgeKey, VeaEpochRow, VeaMessageRow, VeaNetwork, VeaRoute } from "@/lib/vea/types";

const NETWORK_NAME: Record<VeaNetwork, string> = { testnet: "Testnet", devnet: "Devnet" };

/** `/vea/:bridgeKey/:network/:epoch`: one epoch's facts, its lifecycle and the messages in its snapshot. */
export default function VeaEpochPage() {
  const params = useParams<{ bridgeKey: string; network: string; epoch: string }>();

  const bridgeKey = params.bridgeKey as VeaBridgeKey;
  const network = params.network as VeaNetwork;
  const epoch = Number(params.epoch);
  const route = getVeaRoute(bridgeKey, network);

  return (
    <Page gap={4} className="max-w-316 pt-6 pb-16 lg:px-4">
      <BackBreadcrumb backText="Vea epochs" backTo="/vea" current={`Epoch #${params.epoch ?? ""}`} />
      {!route || Number.isNaN(epoch) ? (
        <Card fluid className="p-6">
          <EmptyState
            title="Invalid epoch link"
            description="The bridge, network or epoch in this URL is not recognised."
          />
        </Card>
      ) : (
        <EpochDetail route={route} epoch={epoch} />
      )}
    </Page>
  );
}

function EpochDetail({ route, epoch }: Readonly<{ route: VeaRoute; epoch: number }>) {
  const { row, messages, isLoading, error } = useVeaEpoch(route, epoch);
  return (
    <QueryState
      isLoading={isLoading}
      isError={Boolean(error)}
      error={error ? new Error(error) : undefined}
      data={row ?? undefined}
      errorTitle="Epoch not found"
      empty={{ title: "Epoch not found", description: "This epoch could not be loaded." }}
    >
      {(r) => <EpochView row={r} messages={messages} />}
    </QueryState>
  );
}

function EpochView({ row, messages }: Readonly<{ row: VeaEpochRow; messages: VeaMessageRow[] }>) {
  useRelativeTimeTick();
  const { route } = row;
  const stateRoot = row.snapshot?.stateRoot ?? row.claim?.stateRoot;
  const saved = row.snapshot?.timestamp;
  const items = [
    {
      id: "route",
      label: "Route",
      value: <ChainRoute from={route.sourceChainId} to={route.destinationChainId} />,
    },
    { id: "network", label: "Network", value: NETWORK_NAME[route.network] },
    {
      id: "root",
      label: "State root",
      value: stateRoot ? (
        <HexValue value={stateRoot} copyLabel="Copy the state root" className="@sm:justify-end" />
      ) : (
        "—"
      ),
    },
    {
      id: "messages",
      label: "Messages",
      value: <span className="font-mono">{row.snapshot?.numberMessages ?? messages.length}</span>,
    },
    ...(saved === undefined
      ? []
      : [{ id: "saved", label: "Snapshot", value: formatUtcFull(saved), hint: <TimeAgo unixSeconds={saved} /> }]),
  ];

  return (
    <Stack gap={8}>
      <Card fluid className="p-6">
        <Stack gap={6}>
          <Inline gap={3}>
            <h1 className="text-klerosUIComponentsPrimaryText text-2xl font-semibold">Epoch #{row.epoch}</h1>
            <VeaStatusBadge status={row.status} />
          </Inline>
          <KeyValueList items={items} />
        </Stack>
      </Card>

      <Section title="Lifecycle">
        <VeaTimeline row={row} />
      </Section>

      <Section title="Messages">
        <VeaMessagesList messages={messages} sourceChainId={route.sourceChainId} />
      </Section>
    </Stack>
  );
}

import type { Message } from "@/lib/types";
import { useExecutionStatus } from "@/hooks/useExecutionStatus";
import { useAdapterStatuses } from "@/hooks/useAdapters";
import TxHeaderCard from "@/components/tx/cards/TxHeaderCard";
import ChainRouteCard from "./cards/ChainRouteCard";
import ThresholdCard from "./cards/ThresholdCard";
import BridgeSummaryCard from "./cards/BridgeSummaryCard";
import AddressesCard from "./cards/AddressCard";
import AdaptersCard from "./cards/AdaptersCard";
import DetailsCard from "./cards/DetailsCard";

export default function TxDetailContent({
  message,
  source,
  txHash,
}: {
  message: Message;
  source: "cache" | "chain" | null;
  txHash: string;
}) {
  const { statuses, isLoading: adaptersLoading } = useAdapterStatuses(message);
  const { status: execStatus, isLoading: execLoading } = useExecutionStatus(message);

  return (
    <>
      {/* ── Combined tx hash + meta header ── */}
      <TxHeaderCard message={message} source={source} txHash={txHash} />

      {/* ── Route | Threshold | Bridges (3-col) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ChainRouteCard message={message} />
        <ThresholdCard message={message} statuses={statuses} isLoading={adaptersLoading} />
        <BridgeSummaryCard message={message} />
      </div>

      {/* ── Addresses | Details + Execution (2-col) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AddressesCard message={message} />
        <DetailsCard message={message} execStatus={execStatus} execLoading={execLoading} />
      </div>

      {/* ── Adapters & Reporters ── */}
      <AdaptersCard message={message} statuses={statuses} isLoading={adaptersLoading} />
    </>
  );
}

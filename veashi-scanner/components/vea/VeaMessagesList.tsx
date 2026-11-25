import {
  DataTable,
  QueryState,
  StatusBadge,
  shortenAddress,
  type DataTableColumn,
} from "@kleros/ui-components-library/kit";
import { HexValue } from "@/components/HexValue";
import { TimeAgo } from "@/components/TimeAgo";
import { getExplorerName, getExplorerTxUrl } from "@/lib/explorer";
import type { VeaMessageRow } from "@/lib/vea/types";

interface VeaMessagesListProps {
  messages: VeaMessageRow[];
  sourceChainId: number;
}

function ShortAddress({ address }: Readonly<{ address: string }>) {
  return (
    <span title={address} className="font-mono whitespace-nowrap">
      {shortenAddress(address)}
    </span>
  );
}

/** The messages in the epoch's snapshot as a kit DataTable: nonce, sender, receiver, transaction, status and age. */
export default function VeaMessagesList({ messages, sourceChainId }: Readonly<VeaMessagesListProps>) {
  const columns: DataTableColumn<VeaMessageRow>[] = [
    {
      key: "nonce",
      header: "Nonce",
      width: 100,
      render: (m) => <span className="font-mono">#{m.nonce}</span>,
    },
    { key: "from", header: "From", width: 160, render: (m) => <ShortAddress address={m.from} /> },
    { key: "to", header: "To", width: 160, render: (m) => <ShortAddress address={m.to} /> },
    {
      key: "tx",
      header: "Transaction",
      render: (m) => (
        <HexValue
          variant="link"
          value={m.txHash}
          display={shortenAddress(m.txHash, 8)}
          copyLabel="Copy the transaction hash"
          href={getExplorerTxUrl(sourceChainId, m.txHash)}
          explorerLabel={`View the transaction on ${getExplorerName(sourceChainId)}`}
          className="whitespace-nowrap"
        />
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 140,
      render: (m) =>
        m.executed ? (
          <StatusBadge tone="success" className="whitespace-nowrap">
            Executed
          </StatusBadge>
        ) : (
          <StatusBadge tone="warning" className="whitespace-nowrap">
            Pending
          </StatusBadge>
        ),
    },
    { key: "age", header: "Sent", align: "right", width: 140, render: (m) => <TimeAgo unixSeconds={m.timestamp} /> },
  ];

  return (
    <QueryState isLoading={false} data={messages} empty={{ title: "No messages in this snapshot" }}>
      {(list) => (
        <DataTable
          columns={columns}
          rows={list}
          rowKey={(m) => m.id}
          className="bg-klerosUIComponentsWhiteBackground"
        />
      )}
    </QueryState>
  );
}

import { useMemo, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Card, Tabs } from "@kleros/ui-components-library";
import {
  EmptyState,
  ExternalLink,
  KeyValueList,
  Page,
  QueryState,
  Section,
  Stack,
  cn,
  shortenAddress,
  type Tone,
} from "@kleros/ui-components-library/kit";
import { BackBreadcrumb } from "@/components/BackBreadcrumb";
import { HexValue } from "@/components/HexValue";
import { RouteMap } from "@/components/RouteMap";
import { useMessageStatuses } from "@/hooks/useMessageStatuses";
import { useRelativeTimeTick } from "@/hooks/useRelativeTimeTick";
import { useTransaction } from "@/hooks/useTransaction";
import { getChainName, isTestnetChain } from "@/lib/chains";
import { getExplorerAddressUrl, getExplorerBlockUrl, getExplorerName, getExplorerTxUrl } from "@/lib/explorer";
import { formatBlock, formatShortAge, formatUtcFull, formatUtcMinute, plural } from "@/lib/format";
import type { MessageStatus } from "@/lib/messageStatus";
import { answerView, dataWords, messageIdForms, networkName, thresholdView } from "@/lib/messageView";
import type { Message } from "@/lib/types";

/** The message page: `/tx/{sourceChainId}/{txHash}`, or `/tx/{txHash}` (no source chain: a note, no reads). */
export default function TransactionPage() {
  // Catch-all route "/tx/*": the segments are "{chainId}/{txHash}" or "{txHash}".
  const splat = useParams()["*"] ?? "";
  const segments = splat.split("/").filter(Boolean);
  const hasChainId = segments.length >= 2;
  const chainId = hasChainId ? Number(segments[0]) : null;
  const txHash = (hasChainId ? segments[1] : segments[0]) ?? "";
  // Back to the list on this message's network (Home keeps testnet in `?network=testnet`).
  const back = chainId !== null && isTestnetChain(chainId) ? "/?network=testnet" : "/";

  return (
    <Page gap={4} className="max-w-316 pt-6 pb-16 lg:px-4">
      <BackBreadcrumb backText="Messages" backTo={back} current={shortenAddress(txHash, 8)} />
      {chainId !== null ? <TxDetail chainId={chainId} txHash={txHash} /> : <NoChainId txHash={txHash} />}
    </Page>
  );
}

/** `/tx/{txHash}` with no source chain: the hash and how to reach the full page. */
function NoChainId({ txHash }: Readonly<{ txHash: string }>) {
  return (
    <Card fluid className="p-6">
      <Stack gap={4}>
        <KeyValueList
          items={[
            {
              label: "Source transaction",
              value: <HexValue value={txHash} copyLabel="Copy transaction hash" className="@sm:justify-end" />,
            },
          ]}
        />
        <EmptyState
          title="Source chain needed"
          description="Open this message from the Messages list or search for its hash there: the link then carries its source chain (/tx/chainId/hash)."
        />
      </Stack>
    </Card>
  );
}

function TxDetail({ chainId, txHash }: Readonly<{ chainId: number; txHash: string }>) {
  const { message, isLoading, error, readFailed } = useTransaction(chainId, txHash);
  return (
    <QueryState
      isLoading={isLoading}
      isError={Boolean(error)}
      error={error ? new Error(error) : undefined}
      data={message ?? undefined}
      errorTitle={readFailed ? "Not checked: the source chain could not be read" : "Message not found"}
      empty={{ title: "Message not found" }}
    >
      {(m) => <MessageView message={m} />}
    </QueryState>
  );
}

/** The answer card (status, route map, key) and the details tabs, from one shared status read. */
function MessageView({ message }: Readonly<{ message: Message }>) {
  useRelativeTimeTick();
  const list = useMemo(() => [message], [message]);
  const { get } = useMessageStatuses(list);
  const status = get(message);
  const answer = answerView(message, status);
  const source = getChainName(message.sourceChain);
  const t = message.blockTimestamp;
  const sent =
    t !== undefined
      ? `Sent from ${source} on ${formatUtcMinute(t)} (${formatShortAge(t)}) · ${networkName(message)}`
      : `Sent from ${source} in block ${formatBlock(message.blockNumber)} · ${networkName(message)}`;

  return (
    <Stack gap={8}>
      <Card fluid className="p-6">
        <Stack gap={6}>
          <div className="flex items-start gap-3">
            <AnswerIcon tone={answer.tone} />
            <div className="min-w-0">
              <h1 className="text-2xl leading-snug font-semibold">{answer.title}</h1>
              <p className="mt-1 text-base">{answer.bridges}</p>
              <p className="text-klerosUIComponentsSecondaryText mt-1 text-sm">{sent}</p>
            </div>
          </div>
          <div>
            <h2 className="sr-only">Route</h2>
            <RouteMap message={message} status={status} />
          </div>
        </Stack>
      </Card>

      <Section title="Message details">
        <Tabs
          aria-label="Message details"
          className="w-full"
          // Equal-width tabs, as drawn. Tabs sizes each tab by its label (`grow`, no `basis-0`), and the className given
          // here replaces its tab-bar classes rather than merging (library-log #21), so the base ones are repeated.
          tabListProps={{ className: "box-border grid h-fit w-full auto-cols-fr grid-flow-col" }}
          items={DETAILS_TABS.map((tab) => ({
            id: tab.id,
            text: tab.text,
            value: tab.id,
            content:
              tab.id === "message" ? <MessageTab message={message} /> : <RawTab message={message} status={status} />,
          }))}
        />
      </Section>
    </Stack>
  );
}

const ICON_STROKE: Partial<Record<Tone, string>> = {
  success: "stroke-klerosUIComponentsSuccess",
  warning: "stroke-klerosUIComponentsWarning",
};

/** The answer's icon: a check (executed), a clock (waiting) or a question mark (not checked). */
function AnswerIcon({ tone }: Readonly<{ tone: Tone }>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn("mt-0.5 size-6 shrink-0 fill-none", ICON_STROKE[tone] ?? "stroke-klerosUIComponentsSecondaryText")}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      {tone === "success" && <path d="M8 12.5l2.5 2.5L16 9.5" />}
      {tone === "warning" && <path d="M12 7v5l3 2" />}
      {tone !== "success" && tone !== "warning" && (
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5M12 16.5v.01" />
      )}
    </svg>
  );
}

/** The panel under the tabs: a fluid Card, as the details are drawn. */
type DetailsTabId = "message" | "raw";

const DETAILS_TABS: readonly { id: DetailsTabId; text: string }[] = [
  { id: "message", text: "Message" },
  { id: "raw", text: "Raw" },
];

function Panel({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Card fluid className="mt-4 p-6">
      {children}
    </Card>
  );
}

function OnChain({ chainId }: Readonly<{ chainId: number }>) {
  return <>on {getChainName(chainId)}</>;
}

function MessageTab({ message }: Readonly<{ message: Message }>) {
  const src = message.sourceChain;
  const dst = message.destinationChain;
  const t = message.blockTimestamp;
  const blockUrl = getExplorerBlockUrl(src, message.blockNumber);
  const items = [
    {
      id: "tx",
      label: "Source transaction",
      value: (
        <HexValue
          value={message.txHash}
          copyLabel="Copy transaction hash"
          href={getExplorerTxUrl(src, message.txHash)}
          explorerLabel={`View the transaction on ${getExplorerName(src)}`}
          className="@sm:justify-end"
        />
      ),
      hint: <OnChain chainId={src} />,
    },
    {
      id: "sender",
      label: "Sender",
      value: (
        <HexValue
          value={message.sourceAddress}
          copyLabel="Copy sender address"
          href={getExplorerAddressUrl(src, message.sourceAddress)}
          explorerLabel={`View the sender on ${getExplorerName(src)}`}
          className="@sm:justify-end"
        />
      ),
      hint: <OnChain chainId={src} />,
    },
    {
      id: "receiver",
      label: "Receiver",
      value: (
        <HexValue
          value={message.destinationAddress}
          copyLabel="Copy receiver address"
          href={getExplorerAddressUrl(dst, message.destinationAddress)}
          explorerLabel={`View the receiver on ${getExplorerName(dst)}`}
          className="@sm:justify-end"
        />
      ),
      hint: <OnChain chainId={dst} />,
    },
    ...(t !== undefined
      ? [
          {
            id: "sent",
            label: "Sent",
            value: (
              <time dateTime={new Date(t * 1000).toISOString()} className="text-sm">
                {formatUtcFull(t)}
              </time>
            ),
            hint: formatShortAge(t),
          },
        ]
      : []),
    {
      id: "block",
      label: "Block",
      value: (
        <span className="inline-flex items-center gap-2">
          <span className="font-mono text-sm">{formatBlock(message.blockNumber)}</span>
          {blockUrl && (
            <ExternalLink href={blockUrl} className="text-sm">
              <span className="sr-only">View the block on {getExplorerName(src)}</span>
            </ExternalLink>
          )}
        </span>
      ),
    },
  ];
  return (
    <Panel>
      <KeyValueList items={items} />
    </Panel>
  );
}

function RawTab({ message, status }: Readonly<{ message: Message; status: MessageStatus }>) {
  const id = messageIdForms(message);
  const t = thresholdView(message, status);
  const data = message.data !== undefined ? dataWords(message.data) : null;
  const items = [
    ...(id
      ? [
          {
            id: "id-hex",
            label: "Message ID (hex)",
            value: <HexValue value={id.hex} copyLabel="Copy message ID (hex)" className="@sm:justify-end" />,
          },
          {
            id: "id-dec",
            label: "Message ID (decimal)",
            value: <HexValue value={id.decimal} copyLabel="Copy message ID (decimal)" className="@sm:justify-end" />,
          },
        ]
      : []),
    ...(data
      ? [
          {
            id: "data",
            label: "Data",
            value:
              data.words.length === 0 ? null : (
                <ol className="flex flex-col gap-2 @sm:items-end">
                  {data.words.map((word, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="text-klerosUIComponentsSecondaryText font-mono text-sm">{i + 1}</span>
                      <HexValue
                        value={word}
                        copyLabel={`Copy word ${i + 1}`}
                        textClassName="max-w-34 text-left @sm:max-w-68"
                      />
                    </li>
                  ))}
                </ol>
              ),
            hint: data.size,
          },
        ]
      : []),
    ...(message.nonce !== undefined
      ? [{ id: "nonce", label: "Nonce", value: <span className="font-mono text-sm">{message.nonce}</span> }]
      : []),
    {
      id: "threshold",
      label: "Threshold",
      value: `${t.needed} of ${plural(t.total, "bridge")} must confirm`,
      hint: t.unread === 0 ? `${t.confirmed} confirmed` : `${t.confirmed} confirmed, ${t.unread} not checked`,
    },
  ];
  return (
    <Panel>
      <KeyValueList items={items} />
    </Panel>
  );
}

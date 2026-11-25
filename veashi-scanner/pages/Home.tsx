import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CompactPagination, NumberField } from "@kleros/ui-components-library";
import {
  DataTable,
  Inline,
  QueryState,
  Section,
  Stack,
  StatusBadge,
  shortenAddress,
  type DataTableColumn,
} from "@kleros/ui-components-library/kit";
import { getAllSourceChains, getDestinationChains } from "@kleros/veashi-sdk";
import { ChainFilterSelect } from "@/components/ChainFilterSelect";
import { ChainRoute } from "@/components/ChainRoute";
import { HeroPage } from "@/components/HeroPage";
import { NetworkSwitch } from "@/components/NetworkSwitch";
import { SearchForm } from "@/components/SearchForm";
import { TimeAgo } from "@/components/TimeAgo";
import { useMessageScanner } from "@/hooks/useMessageScanner";
import { useMessageStatuses } from "@/hooks/useMessageStatuses";
import { useNetworkParam } from "@/hooks/useNetworkParam";
import { useDebounce } from "@/hooks/useDebounce";
import { useRelativeTimeTick } from "@/hooks/useRelativeTimeTick";
import { matchesNetwork } from "@/lib/chains";
import { formatBlock } from "@/lib/format";
import { statusKey, type MessageStatus } from "@/lib/messageStatus";
import { bridgeNames, statusBadge, thresholdText } from "@/lib/messageView";
import { findChainForTx, parseBlockInput } from "@/lib/utils";
import { NO_CHAIN, type ChainFilter, type Message, type Network } from "@/lib/types";

const ITEMS_PER_PAGE = 10;
const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
const NETWORK_NAME: Record<Network, string> = { mainnet: "Mainnet", testnet: "Testnet" };
const NETWORKS = (["mainnet", "testnet"] as const).map((value) => ({ value, label: NETWORK_NAME[value] }));

export default function Home() {
  const [network, setNetwork] = useNetworkParam();
  const [source, setSource] = useState<ChainFilter>(NO_CHAIN);
  const [dest, setDest] = useState<ChainFilter>(NO_CHAIN);
  const [fromBlock, setFromBlock] = useState("");
  const [toBlock, setToBlock] = useState("");
  const [page, setPage] = useState(1);
  useRelativeTimeTick();

  // Block numbers belong to the source chain, so the range applies only once one is picked. Debounced so a scan
  // starts after typing stops for 600 ms, as before.
  const blocksOn = source !== NO_CHAIN;
  const debouncedFrom = useDebounce(fromBlock, 600);
  const debouncedTo = useDebounce(toBlock, 600);
  const parsedFrom = useMemo(() => (blocksOn ? parseBlockInput(debouncedFrom) : undefined), [blocksOn, debouncedFrom]);
  const parsedTo = useMemo(() => (blocksOn ? parseBlockInput(debouncedTo) : undefined), [blocksOn, debouncedTo]);

  const { messages, isScanning, blockRange, error } = useMessageScanner(source, dest, parsedFrom, parsedTo, network);
  const { get } = useMessageStatuses(messages, { enabled: !isScanning });

  const numPages = Math.max(1, Math.ceil(messages.length / ITEMS_PER_PAGE));
  const currentPage = Math.min(page, numPages);
  const rows = messages.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const hasActiveFilter = source !== NO_CHAIN || dest !== NO_CHAIN || fromBlock !== "" || toBlock !== "";
  const resetFilters = () => {
    setSource(NO_CHAIN);
    setDest(NO_CHAIN);
    setFromBlock("");
    setToBlock("");
    setPage(1);
  };

  const changeSource = (next: ChainFilter) => {
    setSource(next);
    // To stays when the new source can reach it; otherwise it goes back to All chains.
    if (next !== NO_CHAIN && dest !== NO_CHAIN && !safeDestinations(next).includes(dest as number)) setDest(NO_CHAIN);
    setFromBlock("");
    setToBlock("");
    setPage(1);
  };

  return (
    <HeroPage
      titleId="find-title"
      hero={
        <Stack gap={6}>
          <h1 id="find-title" className="text-klerosUIComponentsPrimaryText text-2xl font-semibold">
            Find a cross-chain message
          </h1>
          <Stack gap={2}>
            <HashSearch
              aside={
                <NetworkSwitch
                  label="Network"
                  options={NETWORKS}
                  value={network}
                  onChange={(next) => {
                    setNetwork(next);
                    resetFilters();
                  }}
                />
              }
            />
            <p className="text-klerosUIComponentsSecondaryText text-xs">
              Search checks every chain a message can be sent from, mainnet and testnet. The network switch only changes
              the list below.
            </p>
          </Stack>
        </Stack>
      }
    >
      <Section
        title={`${NETWORK_NAME[network]} messages`}
        actions={<p className="text-klerosUIComponentsSecondaryText text-sm">Newest first · refreshes every 15 s</p>}
      >
        <Filters
          network={network}
          source={source}
          dest={dest}
          onSource={changeSource}
          onDest={(next) => {
            setDest(next);
            setPage(1);
          }}
          fromBlock={fromBlock}
          toBlock={toBlock}
          onFromBlock={(v) => {
            setFromBlock(v);
            setPage(1);
          }}
          onToBlock={(v) => {
            setToBlock(v);
            setPage(1);
          }}
          blocksOn={blocksOn}
          scanned={
            blocksOn && blockRange
              ? `Scanning blocks ${formatBlock(blockRange.start)} – ${formatBlock(blockRange.end)}`
              : null
          }
        />
        <QueryState
          isLoading={isScanning && messages.length === 0}
          isError={Boolean(error)}
          error={error ? new Error(error) : undefined}
          data={rows}
          errorTitle="The messages could not be loaded"
          empty={{
            title: "No messages",
            description: "No message matches these filters yet. The list refreshes every 15 s.",
            action: hasActiveFilter ? { text: "Clear filters", onPress: resetFilters } : undefined,
          }}
        >
          {(pageRows) => (
            <Stack gap={4}>
              <MessagesTable rows={pageRows} statusOf={get} />
              <CompactPagination
                currentPage={currentPage}
                numPages={numPages}
                callback={setPage}
                label={`Page ${currentPage}`}
              />
            </Stack>
          )}
        </QueryState>
      </Section>
    </HeroPage>
  );
}

// ─── Search ───────────────────────────────────────────────────────────────────

/** The source-transaction hash search (the shared SearchForm), with `aside` (the network switch) in the same row. */
function HashSearch({ aside }: Readonly<{ aside: ReactNode }>) {
  const navigate = useNavigate();
  return (
    <SearchForm
      label="Source transaction hash"
      placeholder="0x… the hash of the transaction that sent the message"
      aside={aside}
      validate={(q) => {
        if (TX_HASH_REGEX.test(q)) return null;
        return q
          ? "Invalid transaction hash. Expected 0x followed by 64 hex characters."
          : "Enter a source transaction hash: 0x followed by 64 hex characters.";
      }}
      onSearch={async (q) => {
        const chainId = await findChainForTx(q);
        if (!chainId) return "Transaction not found on any supported chain.";
        navigate(`/tx/${chainId}/${q}`);
        return null;
      }}
    />
  );
}

// ─── Filters ──────────────────────────────────────────────────────────────────

function safeSources(network: Network): number[] {
  try {
    return getAllSourceChains().filter((id) => matchesNetwork(id, network));
  } catch {
    return [];
  }
}

function safeDestinations(sourceId: number): number[] {
  try {
    return getDestinationChains(sourceId);
  } catch {
    return [];
  }
}

function Filters({
  network,
  source,
  dest,
  onSource,
  onDest,
  fromBlock,
  toBlock,
  onFromBlock,
  onToBlock,
  blocksOn,
  scanned,
}: Readonly<{
  network: Network;
  source: ChainFilter;
  dest: ChainFilter;
  onSource: (c: ChainFilter) => void;
  onDest: (c: ChainFilter) => void;
  fromBlock: string;
  toBlock: string;
  onFromBlock: (v: string) => void;
  onToBlock: (v: string) => void;
  blocksOn: boolean;
  scanned: string | null;
}>) {
  const sources = useMemo(() => safeSources(network), [network]);
  // To lists the source's destinations, or every destination on the network when From is All chains, so a
  // destination works without a source.
  const destinations = useMemo(() => {
    const ids = source === NO_CHAIN ? sources.flatMap(safeDestinations) : safeDestinations(source);
    return [...new Set(ids)].filter((id) => matchesNetwork(id, network));
  }, [source, sources, network]);

  return (
    <form aria-label="Filter messages" onSubmit={(e) => e.preventDefault()}>
      <Inline gap={6}>
        <Inline gap={3}>
          <ChainFilterSelect label="From" chainIds={sources} value={source} onChange={onSource} />
          <ChainFilterSelect label="To" chainIds={destinations} value={dest} onChange={onDest} />
        </Inline>
        <Inline gap={2} role="group" aria-labelledby="filter-blocks">
          <span id="filter-blocks" className="text-klerosUIComponentsSecondaryText text-sm">
            Source blocks
          </span>
          <Inline gap={2} className="flex-nowrap">
            <BlockField
              label="From block"
              placeholder="from"
              value={fromBlock}
              onChange={onFromBlock}
              isDisabled={!blocksOn}
            />
            <span aria-hidden="true" className="text-klerosUIComponentsSecondaryText">
              –
            </span>
            <BlockField label="To block" placeholder="to" value={toBlock} onChange={onToBlock} isDisabled={!blocksOn} />
          </Inline>
          <span className="text-klerosUIComponentsSecondaryText text-xs">
            {blocksOn ? scanned : "Pick a source chain first"}
          </span>
        </Inline>
      </Inline>
    </form>
  );
}

function BlockField({
  label,
  placeholder,
  value,
  onChange,
  isDisabled,
}: Readonly<{
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  isDisabled: boolean;
}>) {
  return (
    <NumberField
      aria-label={label}
      placeholder={placeholder}
      value={value === "" ? Number.NaN : Number(value)}
      onChange={(n) => onChange(Number.isNaN(n) ? "" : String(n))}
      minValue={0}
      formatOptions={{ useGrouping: false, maximumFractionDigits: 0 }}
      isDisabled={isDisabled}
      inputProps={{ className: "font-mono text-sm" }}
      className="w-36"
    />
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

function MessagesTable({ rows, statusOf }: Readonly<{ rows: Message[]; statusOf: (m: Message) => MessageStatus }>) {
  const navigate = useNavigate();
  const columns: DataTableColumn<Message>[] = [
    {
      key: "status",
      header: "Status",
      width: 160,
      render: (m) => {
        const b = statusBadge(statusOf(m));
        return (
          <StatusBadge tone={b.tone} title={b.title} className="whitespace-nowrap">
            {b.text}
          </StatusBadge>
        );
      },
    },
    {
      key: "route",
      header: "Route",
      width: 292,
      render: (m) => <ChainRoute from={m.sourceChain} to={m.destinationChain} />,
    },
    {
      key: "bridges",
      header: "Bridges",
      render: (m) => (
        <span className="whitespace-nowrap">
          {bridgeNames(m).join(", ")}
          <span className="text-klerosUIComponentsSecondaryText"> · {thresholdText(m)}</span>
        </span>
      ),
    },
    {
      key: "tx",
      header: "Source transaction",
      width: 216,
      render: (m) => (
        <Link
          to={txPath(m)}
          className="text-klerosUIComponentsPrimaryBlue hover:text-klerosUIComponentsSecondaryBlue font-mono whitespace-nowrap"
        >
          {shortenAddress(m.txHash, 8)}
        </Link>
      ),
    },
    {
      key: "block",
      header: "Block",
      align: "right",
      width: 133,
      render: (m) => <span className="font-mono">{formatBlock(m.blockNumber)}</span>,
    },
    {
      key: "age",
      header: "Age",
      align: "right",
      width: 121,
      render: (m) => <TimeAgo unixSeconds={m.blockTimestamp} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={statusKey}
      onRowPress={(m) => navigate(txPath(m))}
      className="bg-klerosUIComponentsWhiteBackground"
    />
  );
}

const txPath = (m: Message) => `/tx/${m.sourceChain}/${m.txHash}`;

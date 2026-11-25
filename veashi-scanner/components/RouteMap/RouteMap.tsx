import type { ReactNode } from "react";
import { Card } from "@kleros/ui-components-library";
import { ExternalLink, StatusBadge, cn, shortenAddress } from "@kleros/ui-components-library/kit";
import { HexValue } from "@/components/HexValue";
import { getChainName } from "@/lib/chains";
import { getExplorerAddressUrl, getExplorerName, getExplorerTxUrl } from "@/lib/explorer";
import { formatBlock, formatShortAge, formatUtcFull, formatUtcMinute, plural } from "@/lib/format";
import type { MessageStatus } from "@/lib/messageStatus";
import {
  destinationBadge,
  destinationNote,
  laneBadge,
  lanes as lanesOf,
  thresholdBadge,
  thresholdDetail,
  thresholdView,
  type Lane,
} from "@/lib/messageView";
import type { Message } from "@/lib/types";

export interface RouteMapProps {
  message: Message;
  /** The message's on-chain status (`useMessageStatuses`): a value not read yet draws as "Not checked". */
  status: MessageStatus;
  /** Extra classes, merged last. */
  className?: string;
}

/** A connector is solid Success once its step is known done, else dashed SecondaryText. */
function lineClasses(done: boolean) {
  return done
    ? { border: "border-solid border-klerosUIComponentsSuccess", stroke: "stroke-klerosUIComponentsSuccess" }
    : {
        border: "border-dashed border-klerosUIComponentsSecondaryText",
        stroke: "stroke-klerosUIComponentsSecondaryText",
      };
}

function ArrowHead({ done, className }: Readonly<{ done: boolean; className?: string }>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className={cn("absolute size-3 fill-none", lineClasses(done).stroke, className)}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 2l4 4-4 4" />
    </svg>
  );
}

/**
 * A line across its box: left to right from the container's `@5xl` width (1024 px) up, top to bottom below it, with an
 * arrow head at its end when `arrow` (`wideArrow` for the wide map, when it differs).
 */
function Wire({ done, arrow, wideArrow = arrow }: Readonly<{ done: boolean; arrow?: boolean; wideArrow?: boolean }>) {
  const { border } = lineClasses(done);
  return (
    <>
      <span aria-hidden="true" className="absolute inset-y-0 left-1/2 -translate-x-1/2 @5xl:hidden">
        <span className={cn("absolute inset-y-0 left-0 -translate-x-1/2 border-l-2", border, arrow && "bottom-0.5")} />
        {arrow && <ArrowHead done={done} className="bottom-0 left-0 -translate-x-1/2 rotate-90" />}
      </span>
      <span aria-hidden="true" className="absolute inset-x-0 top-1/2 hidden -translate-y-1/2 @5xl:block">
        <span
          className={cn("absolute inset-x-0 top-0 -translate-y-1/2 border-t-2", border, wideArrow && "right-0.5")}
        />
        {wideArrow && <ArrowHead done={done} className="top-0 right-0 -translate-y-1/2" />}
      </span>
    </>
  );
}

/** The gap between two parts of the map: a short arrow down on a phone, a line (or an arrow) across on a wide map. */
function Joint({
  done,
  wideArrow,
  label,
  className,
}: Readonly<{ done: boolean; wideArrow: boolean; label?: string; className?: string }>) {
  return (
    <div className={cn("relative h-10 shrink-0 @5xl:h-auto", className)}>
      <Wire done={done} arrow wideArrow={wideArrow} />
      {label && (
        <span className="text-klerosUIComponentsSecondaryText absolute top-1/2 left-1/2 -translate-y-1/2 pl-4 text-xs whitespace-nowrap @5xl:hidden">
          {label}
        </span>
      )}
    </div>
  );
}

/** One end of the map (From, Threshold, To): a fluid core Card. */
function EndCard({ label, children, className }: Readonly<{ label: string; children: ReactNode; className?: string }>) {
  return (
    <Card
      fluid
      role="group"
      aria-label={label}
      className={cn("flex min-w-0 flex-col justify-center gap-1 p-4 @5xl:basis-0", className)}
    >
      {children}
    </Card>
  );
}

function Quiet({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  return <span className={cn("text-klerosUIComponentsSecondaryText text-sm", className)}>{children}</span>;
}

function AddressBox({
  label,
  address,
  chainId,
  role,
}: Readonly<{ label: string; address?: string; chainId: number; role: "Reporter" | "Adapter" }>) {
  return (
    <div className="border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground rounded-base min-w-0 border px-3 py-2 @5xl:grow-11 @5xl:basis-0">
      <span className="text-klerosUIComponentsSecondaryText block text-xs">{label}</span>
      {address ? (
        <HexValue
          variant="link"
          value={address}
          display={shortenAddress(address, 4)}
          href={getExplorerAddressUrl(chainId, address)}
          explorerLabel={`${role} ${address} on ${getExplorerName(chainId)}`}
          copyLabel={`Copy ${role.toLowerCase()} address`}
        />
      ) : (
        <Quiet>Not in the message</Quiet>
      )}
    </div>
  );
}

/** The bracket a lane draws on a wide map: its stub to the fork, and its piece of the fork's upright. */
function Bracket({
  side,
  index,
  count,
  stubDone,
  uprightDone,
}: Readonly<{ side: "left" | "right"; index: number; count: number; stubDone: boolean; uprightDone: boolean }>) {
  const upright =
    count === 1 ? null : index === 0 ? "top-1/2 bottom-0" : index === count - 1 ? "top-0 bottom-1/2" : "inset-y-0";
  return (
    <div aria-hidden="true" className="relative hidden w-4 shrink-0 @5xl:block">
      <span className={cn("absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2", lineClasses(stubDone).border)} />
      {upright && (
        <span
          className={cn(
            "absolute border-l-2",
            side === "left" ? "left-0" : "right-0",
            upright,
            lineClasses(uprightDone).border
          )}
        />
      )}
    </div>
  );
}

function LaneRow({
  lane,
  index,
  count,
  message,
  joinDone,
}: Readonly<{ lane: Lane; index: number; count: number; message: Message; joinDone: boolean }>) {
  const badge = laneBadge(lane.state);
  const confirmed = lane.state === "confirmed";
  return (
    <li className="flex items-stretch">
      <Bracket side="left" index={index} count={count} stubDone uprightDone />
      <div className="bg-klerosUIComponentsLightBackground rounded-base flex min-w-0 grow flex-col p-2 @5xl:my-1 @5xl:flex-row @5xl:items-center">
        <AddressBox
          label={`Reporter on ${getChainName(message.sourceChain)}`}
          address={lane.reporter}
          chainId={message.sourceChain}
          role="Reporter"
        />
        <div className="relative flex min-w-0 flex-col items-center justify-center gap-3 py-3 @5xl:grow-7 @5xl:basis-0">
          <Wire done={confirmed} arrow />
          <span className="bg-klerosUIComponentsLightBackground relative px-2 text-base leading-tight font-semibold">
            {lane.bridge}
          </span>
          <span className="bg-klerosUIComponentsLightBackground relative px-2 leading-none">
            <StatusBadge tone={badge.tone} className="whitespace-nowrap">
              {badge.text}
            </StatusBadge>
          </span>
        </div>
        <AddressBox
          label={`Adapter on ${getChainName(message.destinationChain)}`}
          address={lane.adapter}
          chainId={message.destinationChain}
          role="Adapter"
        />
      </div>
      <Bracket side="right" index={index} count={count} stubDone={confirmed} uprightDone={joinDone} />
    </li>
  );
}

/**
 * The message's route, left to right on a wide map: the From card, one lane per bridge (reporter on the source chain,
 * the bridge and its status, adapter on the destination), the Threshold card and the To card, joined by lines that are
 * solid where a step is known done. Below a 1024 px wide container it stacks top to bottom. Any number of bridges.
 * A value whose read failed or is not back draws as "Not checked", never as a guess.
 */
export function RouteMap({ message, status, className }: Readonly<RouteMapProps>) {
  const source = getChainName(message.sourceChain);
  const destination = getChainName(message.destinationChain);
  const lanes = lanesOf(message, status);
  const threshold = thresholdView(message, status);
  const met = threshold.state === "met";
  const executed = status.executed === true;
  const toBadge = destinationBadge(status);
  const metBadge = thresholdBadge(threshold);
  const note = destinationNote(status, threshold);
  const txUrl = getExplorerTxUrl(message.sourceChain, message.txHash);
  const receiverUrl = getExplorerAddressUrl(message.destinationChain, message.destinationAddress);
  const time = message.blockTimestamp;
  const forkLabel =
    lanes.length === 1 ? `through ${lanes[0].bridge}` : `${plural(lanes.length, "bridge")}, side by side`;

  return (
    <div className={cn("@container", className)}>
      <div className="flex flex-col @5xl:flex-row @5xl:items-stretch">
        <EndCard label={`Source: ${source}`} className="@5xl:grow-9">
          <Quiet>From</Quiet>
          <span className="text-lg leading-snug font-semibold">{source}</span>
          <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge tone="success">Sent</StatusBadge>
            {time !== undefined && (
              <time dateTime={new Date(time * 1000).toISOString()} title={formatUtcFull(time)} className="text-sm">
                {formatUtcMinute(time)}
              </time>
            )}
          </span>
          <Quiet>
            {time !== undefined && `${formatShortAge(time)} · `}block{" "}
            <span className="text-klerosUIComponentsPrimaryText font-mono">{formatBlock(message.blockNumber)}</span>
          </Quiet>
          {txUrl && (
            <ExternalLink href={txUrl} className="mt-2 text-sm">
              View on {getExplorerName(message.sourceChain)}
            </ExternalLink>
          )}
        </EndCard>

        <Joint done wideArrow={false} label={forkLabel} className="@5xl:w-4" />

        <ul
          aria-label="Bridges carrying this message, side by side"
          className="flex min-w-0 flex-col gap-2 @5xl:grow-29 @5xl:basis-0 @5xl:justify-center @5xl:gap-0"
        >
          {lanes.map((lane, i) => (
            <LaneRow key={lane.adapter} lane={lane} index={i} count={lanes.length} message={message} joinDone={met} />
          ))}
        </ul>

        <Joint done={met} wideArrow className="@5xl:w-6" />

        <EndCard label="Threshold" className="@5xl:grow-8">
          <Quiet>Threshold</Quiet>
          <span className="text-2xl font-semibold">
            {threshold.confirmed} of {threshold.total}
          </span>
          <span className="text-sm">{thresholdDetail(threshold)}</span>
          <span
            role="img"
            aria-label={`${threshold.confirmed} of ${plural(threshold.total, "bridge")} ${thresholdDetail(threshold)}`}
            className="mt-2 flex gap-1"
          >
            {lanes.map((lane) => (
              <span
                key={lane.adapter}
                className={cn(
                  "h-2 flex-1 rounded-full",
                  lane.state === "confirmed" ? "bg-klerosUIComponentsSuccess" : "bg-klerosUIComponentsStroke"
                )}
              />
            ))}
          </span>
          <span className="mt-2">
            <StatusBadge tone={metBadge.tone}>{metBadge.text}</StatusBadge>
          </span>
        </EndCard>

        <Joint done={executed} wideArrow className="@5xl:w-6" />

        <EndCard label={`Destination: ${destination}`} className="@5xl:grow-9">
          <Quiet>To</Quiet>
          <span className="text-lg leading-snug font-semibold">{destination}</span>
          <span className="mt-2">
            <StatusBadge tone={toBadge.tone}>{toBadge.text}</StatusBadge>
          </span>
          {note && <Quiet>{note}</Quiet>}
          <Quiet className="mt-2">Receiver</Quiet>
          <HexValue
            variant="link"
            value={message.destinationAddress}
            display={shortenAddress(message.destinationAddress, 4)}
            href={receiverUrl}
            explorerLabel={`Receiver ${message.destinationAddress} on ${getExplorerName(message.destinationChain)}`}
            copyLabel="Copy receiver address"
          />
        </EndCard>
      </div>
    </div>
  );
}

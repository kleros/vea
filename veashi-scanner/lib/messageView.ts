/**
 * Words for a message and its on-chain status, shared by Home and the message page (design A), with no React.
 */
import type { Tone } from "@kleros/ui-components-library/kit";
import type { MessageStatus } from "@/lib/messageStatus";
import { getBridgeLabel, getBridgeName } from "@/lib/veashiHelpers";
import type { Message } from "@/lib/types";
import { getChainName, isTestnetChain } from "@/lib/chains";
import { joinWords, plural } from "@/lib/format";

/** The name shown for an adapter the SDK does not list for the message's route. */
export const UNKNOWN_BRIDGE = "Unknown";

/** The bridge name of each of the message's adapters, in the message's order. */
export function bridgeNames(m: Message): string[] {
  return (m.adapters ?? []).map((adapter, i) => {
    const bridge = getBridgeName(m.sourceChain, m.destinationChain, adapter, m.reporters?.[i]);
    return bridge === null ? UNKNOWN_BRIDGE : getBridgeLabel(bridge);
  });
}

/** "2 of 3 needed": the message's threshold out of its bridges. */
export function thresholdText(m: Message): string {
  return `${m.thresholdRequired} of ${m.adapters?.length ?? 0} needed`;
}

/**
 * The status badge: Executed (success), Pending (warning), or Not checked (neutral) while the read has not finished
 * or has failed. Never a guess.
 */
export function statusBadge(s: MessageStatus): { tone: Tone; text: string; title: string } {
  if (s.state === "executed") return { tone: "success", text: "Executed", title: "Executed on the destination chain" };
  if (s.state === "waiting")
    return { tone: "warning", text: "Pending", title: "Not executed on the destination chain yet" };
  return {
    tone: "neutral",
    text: "Not checked",
    title: s.error ? "The on-chain check failed; it is retried" : "The on-chain check has not finished",
  };
}

// ─── The message page (A3c) ──────────────────────────────────────────────────

/** One bridge's state on the message page: its adapter holds the hash, holds none yet, or was not read. */
export type LaneState = "confirmed" | "pending" | "not-checked";

/** One lane of the route map: a bridge, its reporter on the source chain and its adapter on the destination. */
export interface Lane {
  bridge: string;
  /** Missing when the message names fewer reporters than adapters. */
  reporter?: string;
  adapter: string;
  state: LaneState;
}

export function laneBadge(state: LaneState): { tone: Tone; text: string } {
  if (state === "confirmed") return { tone: "success", text: "Confirmed" };
  if (state === "pending") return { tone: "warning", text: "Pending" };
  return { tone: "neutral", text: "Not checked" };
}

/** The message's lanes, in its adapters' order. */
export function lanes(m: Message, s: MessageStatus): Lane[] {
  const names = bridgeNames(m);
  return (m.adapters ?? []).map((adapter, i) => {
    const read = s.adapters[adapter.toLowerCase()];
    return {
      bridge: names[i],
      reporter: m.reporters?.[i],
      adapter,
      state: read === true ? "confirmed" : read === false ? "pending" : "not-checked",
    };
  });
}

/**
 * What the reads say about the threshold. `confirmed` counts only adapters read as holding the hash. "met" is known as
 * soon as that reaches `needed`; "not-met" only when every adapter was read; otherwise "not-checked".
 */
export interface ThresholdView {
  confirmed: number;
  unread: number;
  total: number;
  needed: number;
  state: "met" | "not-met" | "not-checked";
}

export function thresholdView(m: Message, s: MessageStatus): ThresholdView {
  const states = lanes(m, s).map((l) => l.state);
  const confirmed = states.filter((x) => x === "confirmed").length;
  const unread = states.filter((x) => x === "not-checked").length;
  const needed = m.thresholdRequired;
  const state = confirmed >= needed ? "met" : unread === 0 ? "not-met" : "not-checked";
  return { confirmed, unread, total: states.length, needed, state };
}

export function thresholdBadge(t: ThresholdView): { tone: Tone; text: string } {
  if (t.state === "met") return { tone: "success", text: "Met" };
  if (t.state === "not-met") return { tone: "warning", text: "Not met" };
  return { tone: "neutral", text: "Not checked" };
}

/** "confirmed, 2 needed", or "confirmed, 1 not checked, 2 needed" while a read is missing. */
export function thresholdDetail(t: ThresholdView): string {
  return t.unread === 0 ? `confirmed, ${t.needed} needed` : `confirmed, ${t.unread} not checked, ${t.needed} needed`;
}

/** The destination's badge: Executed, Pending (not executed yet), or Not checked. */
export function destinationBadge(s: MessageStatus): { tone: Tone; text: string } {
  if (s.executed === true) return { tone: "success", text: "Executed" };
  if (s.executed === false) return { tone: "warning", text: "Pending" };
  return { tone: "neutral", text: "Not checked" };
}

/** The line under the destination's badge while the message is not executed: when it can run. */
export function destinationNote(s: MessageStatus, t: ThresholdView): string | null {
  if (s.executed !== false) return null;
  if (t.state === "met") return "Not executed. Enough bridges confirmed, so it can run now.";
  // An adapter not read yet may already hold the hash: no count.
  if (t.state === "not-checked") return "Not executed.";
  const left = t.needed - t.confirmed;
  const who = t.confirmed === 0 ? plural(left, "bridge") : `${left} more ${left === 1 ? "bridge" : "bridges"}`;
  return `Not executed. It can run once ${who} ${left === 1 ? "confirms" : "confirm"}.`;
}

/**
 * The answer card's words: its tone (the icon), the h1, and the line on the bridges.
 * Executed: "Executed on Base Sepolia". Waiting: "Not executed yet: waiting for Vea", or "...: enough bridges
 * confirmed" once the threshold is met. Execution not read: "Not checked: execution on Base Sepolia".
 */
export function answerView(m: Message, s: MessageStatus): { tone: Tone; title: string; bridges: string } {
  const dest = getChainName(m.destinationChain);
  const t = thresholdView(m, s);
  const total = plural(t.total, "bridge");
  const count =
    t.unread === 0
      ? `${t.confirmed} of ${total} confirmed, ${t.needed} needed.`
      : `${t.confirmed} of ${total} confirmed so far, ${t.unread} not checked, ${t.needed} needed.`;
  const waitingFor = lanes(m, s).filter((l) => l.state === "pending");
  const named = waitingFor.length > 0 && waitingFor.every((l) => l.bridge !== UNKNOWN_BRIDGE);

  if (s.executed === true) return { tone: "success", title: `Executed on ${dest}`, bridges: count };
  if (s.executed === null) return { tone: "neutral", title: `Not checked: execution on ${dest}`, bridges: count };
  if (t.state === "met")
    return { tone: "warning", title: "Not executed yet: enough bridges confirmed", bridges: count };
  // An adapter not read yet may already hold the hash: name no bridge as the one it waits for.
  if (t.state === "not-checked") return { tone: "warning", title: "Not executed yet", bridges: count };

  const names = joinWords(waitingFor.map((l) => l.bridge));
  const title = named ? `Not executed yet: waiting for ${names}` : "Not executed yet";
  if (waitingFor.length === 0) return { tone: "warning", title, bridges: count };
  const whose = named
    ? waitingFor.length === 1
      ? `${names}’s adapter on ${dest} has`
      : `${joinWords(waitingFor.map((l) => `${l.bridge}’s`))} adapters on ${dest} have`
    : `The adapters of ${plural(waitingFor.length, "bridge")} on ${dest} have`;
  return { tone: "warning", title, bridges: `${count} ${whose} no hash for this message yet.` };
}

/** "Testnet" or "Mainnet", for the source chain. */
export function networkName(m: Message): string {
  return isTestnetChain(m.sourceChain) ? "Testnet" : "Mainnet";
}

/** The message ID as hex (32 bytes) and decimal, or null when it is missing or not a number. */
export function messageIdForms(m: Message): { hex: string; decimal: string } | null {
  if (!m.messageId) return null;
  try {
    const id = BigInt(m.messageId);
    return { hex: `0x${id.toString(16).padStart(64, "0")}`, decimal: id.toString() };
  } catch {
    return null;
  }
}

/** The data as 32-byte words (hex, no 0x; the last can be shorter), and its size: "64 bytes, 2 words of 32 bytes". */
export function dataWords(data: string): { words: string[]; size: string } {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const bytes = Math.floor(hex.length / 2);
  const words: string[] = [];
  for (let i = 0; i < hex.length; i += 64) words.push(hex.slice(i, i + 64));
  const full = Math.floor(bytes / 32);
  const rest = bytes % 32;
  let size = `${plural(bytes, "byte")}`;
  if (bytes === 0) size = "No data (0 bytes)";
  else if (rest === 0) size += `, ${plural(full, "word")} of 32 bytes`;
  else if (full === 0) size += `, 1 word`;
  else size += `, ${plural(full, "word")} of 32 bytes and 1 of ${plural(rest, "byte")}`;
  return { words, size };
}

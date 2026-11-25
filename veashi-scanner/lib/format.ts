/**
 * Display text for times and counts: "1 day ago", "23 Nov, 13:34 UTC", "21 Oct 2026",
 * "3 bridges", "CCIP, LayerZero and Axelar". Times are block timestamps in unix seconds, shown in UTC.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");

/** "1 bridge", "3 bridges"; `many` defaults to `one` + "s". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "A", "A and B", "A, B and C". */
export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** "21 Oct 2026" (UTC). */
export function formatUtcDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Design A's short age, two units at most: "just now", "12m ago", "3h 5m ago", "1d 10h ago", "2y 14d ago". */
export function formatShortAge(unixSeconds: number, nowMs = Date.now()): string {
  const s = Math.max(0, Math.floor(nowMs / 1000 - unixSeconds));
  const m = Math.floor(s / 60);
  const h = Math.floor(s / 3600);
  const d = Math.floor(s / 86_400);
  if (m < 1) return "just now";
  if (h < 1) return `${m}m ago`;
  if (d < 1) return `${h}h ${m % 60}m ago`;
  if (d < 365) return `${d}d ${h % 24}h ago`;
  return `${Math.floor(d / 365)}y ${d % 365}d ago`;
}

/** "23 Nov 2026, 13:34:13 UTC", for a time's tooltip. */
export function formatUtcFull(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${formatUtcDate(unixSeconds)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(
    d.getUTCSeconds()
  )} UTC`;
}

/** "331,988,992": a block number with thousands separators. */
export function formatBlock(block: number): string {
  return block.toLocaleString("en-US");
}

/** "23 Nov 2026, 13:34 UTC": the date with its year and the time to the minute (UTC). */
export function formatUtcMinute(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${formatUtcDate(unixSeconds)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

import { cn } from "@kleros/ui-components-library/kit";
import { formatShortAge, formatUtcFull } from "@/lib/format";

export interface TimeAgoProps {
  /** Unix time in seconds; undefined shows "—". */
  unixSeconds?: number;
  /** Extra classes, merged last. */
  className?: string;
}

/**
 * How long ago, in two units ("1d 10h ago"), as a `time` element with the ISO `dateTime` and the full UTC time as its
 * title. The page re-renders it through `useRelativeTimeTick`. Home's table and the Vea tables use it.
 */
export function TimeAgo({ unixSeconds, className }: Readonly<TimeAgoProps>) {
  if (unixSeconds === undefined) return <span className={className}>—</span>;
  return (
    <time
      dateTime={new Date(unixSeconds * 1000).toISOString()}
      title={formatUtcFull(unixSeconds)}
      className={cn("whitespace-nowrap", className)}
    >
      {formatShortAge(unixSeconds)}
    </time>
  );
}

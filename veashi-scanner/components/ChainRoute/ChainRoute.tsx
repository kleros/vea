import { cn } from "@kleros/ui-components-library/kit";
import { getChainName } from "@/lib/chains";

export interface ChainRouteProps {
  /** Source chain ID. */
  from: number;
  /** Destination chain ID. */
  to: number;
  /** Extra classes, merged last. */
  className?: string;
}

/**
 * "Arbitrum Sepolia → Base Sepolia" on one line: the chain names with a quiet arrow between them (screen readers hear
 * "to"). Home's table, the Vea epochs table and the epoch page use it.
 */
export function ChainRoute({ from, to, className }: Readonly<ChainRouteProps>) {
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap", className)}>
      <span>{getChainName(from)}</span>
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-klerosUIComponentsSecondaryText shrink-0"
      >
        <path d="M5 12h14" />
        <path d="M13 6l6 6-6 6" />
      </svg>
      <span className="sr-only">to</span>
      <span>{getChainName(to)}</span>
    </span>
  );
}

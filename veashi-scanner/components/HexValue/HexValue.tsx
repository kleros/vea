import { Copiable } from "@kleros/ui-components-library";
import { ExternalLink, cn } from "@kleros/ui-components-library/kit";

export interface HexValueProps {
  /** The full value: what the copy button copies, and the text in the "full" variant. */
  value: string;
  /** Accessible name of the copy button, e.g. "Copy sender address". */
  copyLabel: string;
  /** The value's page on a block explorer. */
  href?: string;
  /** Accessible name of the explorer link, e.g. "View the sender on Arbiscan". */
  explorerLabel?: string;
  /**
   * "link": the shortened value is the explorer link (PrimaryBlue), then the copy button (the route map).
   * "full": the whole value in PrimaryText, wrapping anywhere, then the copy button and a "↗" explorer link (details).
   * @default "full"
   */
  variant?: "link" | "full";
  /** The text shown in the "link" variant, e.g. "0xdfF2…480e". @default value */
  display?: string;
  /**
   * "full" variant: false keeps the value on one line (a table that scrolls sideways). @default true: it wraps anywhere,
   * at 22 mono characters a line while the nearest `@container` (a kit KeyValueList) is under 384 px, as drawn.
   */
  wrap?: boolean;
  /** "full" variant: classes for the value's text, e.g. a max width. */
  textClassName?: string;
  /** Extra classes, merged last. */
  className?: string;
}

/**
 * A hash or address in mono with its copy button (core `Copiable`) and its explorer link: the route map's short links
 * and the details' full values. Every place on the message page that shows a hex value uses it.
 */
export function HexValue({
  value,
  copyLabel,
  href,
  explorerLabel,
  variant = "full",
  display,
  wrap = true,
  textClassName,
  className,
}: Readonly<HexValueProps>) {
  if (variant === "link") {
    const text = <span className="font-mono text-sm">{display ?? value}</span>;
    return (
      <Copiable copiableContent={value} info={copyLabel} className={cn("gap-1", className)}>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={value}
            aria-label={explorerLabel ?? value}
            className="text-klerosUIComponentsPrimaryBlue hover:text-klerosUIComponentsSecondaryBlue"
          >
            {text}
          </a>
        ) : (
          <span title={value} className="text-klerosUIComponentsPrimaryText">
            {text}
          </span>
        )}
      </Copiable>
    );
  }
  return (
    <div className={cn("flex min-w-0 items-start gap-2", className)}>
      <Copiable copiableContent={value} info={copyLabel} className="min-w-0 items-start">
        <span
          className={cn(
            "min-w-0 font-mono text-sm",
            wrap ? "max-w-47 break-all @sm:max-w-none" : "whitespace-nowrap",
            textClassName
          )}
        >
          {value}
        </span>
      </Copiable>
      {href && (
        <ExternalLink href={href} className="relative shrink-0 text-sm">
          <span className="sr-only">{explorerLabel ?? "View on the explorer"}</span>
        </ExternalLink>
      )}
    </div>
  );
}

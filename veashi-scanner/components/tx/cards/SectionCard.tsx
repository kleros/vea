import type { ReactNode } from "react";
import { Card } from "@kleros/ui-components-library";
import type { IconType } from "@/lib/types";
import SectionLabel from "../SectionLabel";

interface SectionCardProps {
  /** Optional icon + label header rendered at the top of the card. */
  icon?: IconType;
  label?: string;
  /** Staggered entrance delay, e.g. "0.1s". Omit for no animation. */
  delay?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Generic container for transaction-detail cards. Wraps the library `Card`
 * and optionally renders a `SectionLabel` header. Replaces the repeated
 * `glass rounded-xl border ... p-5 animate-fade-in` wrapper that every
 * tx card used to copy-paste.
 */
export default function SectionCard({ icon, label, delay, className = "", children }: Readonly<SectionCardProps>) {
  return (
    <Card
      round
      // Override the library Card's hardcoded `w-[328px] h-[200px]` so cards fill
      // their grid column and grow with content. (Card uses tailwind-merge, so
      // these win over the defaults.)
      className={`w-full h-auto min-w-0 p-5 ${delay ? "animate-fade-in" : ""} ${className}`.trim()}
      style={delay ? { animationDelay: delay } : undefined}
    >
      {icon && label && <SectionLabel icon={icon} label={label} />}
      {children}
    </Card>
  );
}

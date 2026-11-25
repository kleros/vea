import type { ReactNode } from "react";
import { Page, Stack, cn } from "@kleros/ui-components-library/kit";

/** The shared container width of design A's bands (1232 px of content), as in AppHeader. */
const BAND = "mx-auto w-full max-w-316 px-4";

export interface HeroPageProps {
  /** The id of the h1 inside `hero`; it names the hero section. */
  titleId: string;
  /** The white band's content: the h1, its line, the search or the network switch. */
  hero: ReactNode;
  /** The list band (LightBackground) under it: the kit Section with the table. */
  children: ReactNode;
  /** Extra classes for the list band, merged last. */
  className?: string;
}

/**
 * HeroPage: design A's list page frame (Home, Routes, Vea). One kit Page (the `main` landmark) holds a full-width
 * WhiteBackground hero band with a Stroke line under it, then the list band, both 1232 px wide.
 * Tailwind classes only: library parts, kit layout and klerosUIComponents* tokens (agent/LOOK.md).
 */
export function HeroPage({ titleId, hero, children, className }: Readonly<HeroPageProps>) {
  return (
    <Page gap={0} className="max-w-none p-0 lg:px-0">
      <section
        aria-labelledby={titleId}
        className="bg-klerosUIComponentsWhiteBackground border-klerosUIComponentsStroke border-b"
      >
        <div className={cn(BAND, "py-8")}>{hero}</div>
      </section>
      <Stack gap={4} className={cn(BAND, "pt-8 pb-16", className)}>
        {children}
      </Stack>
    </Page>
  );
}

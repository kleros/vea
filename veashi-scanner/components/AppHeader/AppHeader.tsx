import { Link, useLocation } from "react-router-dom";
import { Button } from "@kleros/ui-components-library";
import { ExternalLink, Inline, cn, useDarkMode } from "@kleros/ui-components-library/kit";

export interface AppHeaderProps {
  /** Extra classes, merged last. */
  className?: string;
}

/** The key the mode switch saves the viewer's choice under. index.html's inline script reads it before first paint. */
const THEME_STORAGE_KEY = "veashi-theme";

type NavKey = "messages" | "routes" | "vea";

const NAV: { key: NavKey; to: string; text: string }[] = [
  { key: "messages", to: "/", text: "Messages" },
  { key: "routes", to: "/routes", text: "Routes" },
  { key: "vea", to: "/vea", text: "Vea" },
];

/** Messages is current on `/` and on a message (`/tx/*`), Routes on `/routes`, Vea on `/vea` and an epoch page. */
function currentNav(pathname: string): NavKey | null {
  if (pathname === "/" || pathname.startsWith("/tx/")) return "messages";
  if (pathname.startsWith("/routes")) return "routes";
  if (pathname === "/vea" || pathname.startsWith("/vea/")) return "vea";
  return null;
}

/**
 * The band's token per mode. The band is the one part of the page that changes token between modes (light:
 * PrimaryPurple, dark: DarkPurple), and the lint rejects `dark:` colour classes in new code (library-log #14), so the
 * class is picked from kit `useDarkMode()`, which follows the `dark` class that index.html sets before first paint.
 */
function bandClasses(dark: boolean) {
  return {
    band: dark ? "bg-klerosUIComponentsDarkPurple" : "bg-klerosUIComponentsPrimaryPurple",
    // The switch keeps the band's colour on hover (core Button's own hover is SecondaryBlue).
    hover: dark ? "hover:bg-klerosUIComponentsDarkPurple" : "hover:bg-klerosUIComponentsPrimaryPurple",
    quiet: dark ? "text-klerosUIComponentsSecondaryText" : "text-klerosUIComponentsMediumPurple",
    line: dark ? "border-klerosUIComponentsStroke" : "border-klerosUIComponentsPrimaryPurple",
  };
}

function saveTheme(dark: boolean) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  } catch {
    // Private mode or blocked storage: the switch still works for this page load.
  }
}

/**
 * The site header on every page: the logo, "Veashi" and "Cross-Chain Explorer" (a link home), the nav (Messages,
 * Routes, Vea, GitHub ↗) with the current page marked, and the light/dark switch, in the purple band.
 */
export function AppHeader({ className }: Readonly<AppHeaderProps>) {
  const { pathname, search } = useLocation();
  const current = currentNav(pathname);
  // Messages and Routes share `?network=testnet` (useNetworkParam), so their links carry it while it is in the URL.
  // Vea's networks are Testnet / Devnet, kept in its own state, so its link never carries it.
  const testnet = new URLSearchParams(search).get("network") === "testnet";
  const href = (item: (typeof NAV)[number]) => (testnet && item.key !== "vea" ? `${item.to}?network=testnet` : item.to);
  const [dark, setDark] = useDarkMode();
  const c = bandClasses(dark);

  const toggleMode = () => {
    setDark(!dark);
    saveTheme(!dark);
  };

  return (
    <header className={cn("border-b", c.band, c.line, className)}>
      <Inline gap={3} justify="between" className="mx-auto w-full max-w-316 px-4 py-3">
        <Link to="/" className="text-klerosUIComponentsLightPurple flex items-center gap-3">
          <svg
            aria-hidden="true"
            width="32"
            height="32"
            viewBox="0 0 32 32"
            fill="none"
            strokeWidth="2"
            strokeLinejoin="round"
            className="stroke-klerosUIComponentsLightPurple shrink-0"
          >
            <path d="M3 6h26L16 28z" />
            <path d="M10 10h12l-6 10z" />
          </svg>
          <span className="flex flex-col">
            <span className="text-lg leading-tight font-semibold">Veashi</span>
            <span className={cn("text-xs leading-tight", c.quiet)}>Cross-Chain Explorer</span>
          </span>
        </Link>
        <nav aria-label="Main">
          <ul className="flex flex-wrap items-center gap-6">
            {NAV.map((item) => (
              <li key={item.key}>
                <Link
                  to={href(item)}
                  aria-current={current === item.key ? "page" : undefined}
                  className={cn(
                    "text-klerosUIComponentsLightPurple text-sm hover:underline",
                    current === item.key ? "font-semibold" : "font-normal"
                  )}
                >
                  {item.text}
                </Link>
              </li>
            ))}
            <li>
              <ExternalLink href="https://github.com/kleros/vea" className="text-klerosUIComponentsLightPurple text-sm">
                GitHub
              </ExternalLink>
            </li>
            <li>
              <Button
                text={dark ? "Switch to light mode" : "Switch to dark mode"}
                onPress={toggleMode}
                className={cn(
                  "size-8 border p-0",
                  c.band,
                  c.hover,
                  c.line,
                  "hover:border-klerosUIComponentsLightPurple"
                )}
              >
                {dark ? <SunIcon /> : <MoonIcon />}
              </Button>
            </li>
          </ul>
        </nav>
      </Inline>
    </header>
  );
}

function MoonIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="stroke-klerosUIComponentsLightPurple"
    >
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      className="stroke-klerosUIComponentsLightPurple"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Breadcrumb } from "@kleros/ui-components-library";

export interface BackBreadcrumbProps {
  /** The list to go back to, e.g. "Messages". */
  backText: string;
  /** Its in-app path, e.g. "/?network=testnet". */
  backTo: string;
  /** This page's crumb, e.g. the short hash or "Epoch #123". */
  current: ReactNode;
  /** Extra classes, merged last. */
  className?: string;
}

/**
 * "← Messages / 0x515f…50fb": core `Breadcrumb` with a back crumb and this page's crumb. The back crumb navigates with
 * the app's router through `callback`, since Breadcrumb's `href` cannot reach it (library-log #17). The message page
 * and the Vea epoch page use it.
 */
export function BackBreadcrumb({ backText, backTo, current, className }: Readonly<BackBreadcrumbProps>) {
  const navigate = useNavigate();
  return (
    <Breadcrumb
      as="nav"
      clickable
      callback={(to: string) => to && navigate(to)}
      className={className}
      items={[
        {
          text: (
            <span className="text-klerosUIComponentsPrimaryBlue hover:text-klerosUIComponentsSecondaryBlue inline-flex items-center gap-1 text-sm">
              <ArrowLeftIcon />
              {backText}
            </span>
          ),
          value: backTo,
        },
        { text: <span className="font-mono text-sm font-normal">{current}</span>, value: "" },
      ]}
    />
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4 fill-none stroke-current"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

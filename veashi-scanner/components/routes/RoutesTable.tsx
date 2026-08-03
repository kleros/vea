import { useState } from "react";
import type { SVGAttributes } from "react";
import { Button } from "@kleros/ui-components-library";
import type { Bridges } from "@kleros/veashi-sdk";
import ChainBadge from "@/components/ChainBadge";
import BridgeBadge from "@/components/BridgeBadge";
import RouteDetailsModal from "./RouteDetailsModal";

export interface RouteRow {
  sourceChainId: number;
  destinationChainId: number;
  bridges: Bridges[];
}

function InfoIcon(props: SVGAttributes<SVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

interface Props {
  routes: RouteRow[];
}

export default function RoutesTable({ routes }: Readonly<Props>) {
  const [selected, setSelected] = useState<RouteRow | null>(null);

  if (routes.length === 0) {
    return (
      <div className="glass border border-(--border) py-16 text-center">
        <p className="text-(--text-muted) text-sm">No routes configured.</p>
      </div>
    );
  }

  return (
    <>
      <div className="glass overflow-hidden border border-(--border)">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-(--border) bg-(--surface)">
                {["Source Chain", "Destination Chain", "Bridges", ""].map((col) => (
                  <th
                    key={col}
                    className="px-6 py-3 text-left text-xs font-semibold text-(--text-muted) uppercase tracking-wider"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-(--border)">
              {routes.map((route) => (
                <tr
                  key={`${route.sourceChainId}-${route.destinationChainId}`}
                  className="hover:bg-(--surface-elevated) transition-all"
                >
                  <td className="px-6 py-3">
                    <ChainBadge chainId={route.sourceChainId} />
                  </td>
                  <td className="px-6 py-3">
                    <ChainBadge chainId={route.destinationChainId} />
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {route.bridges.map((bridge) => (
                        <button
                          key={bridge}
                          type="button"
                          onClick={() => setSelected(route)}
                          className="appearance-none bg-transparent border-0 p-0 m-0 cursor-pointer"
                        >
                          <BridgeBadge bridge={bridge} />
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <Button
                      variant="secondary"
                      small
                      text="Details"
                      Icon={InfoIcon}
                      onPress={() => setSelected(route)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <RouteDetailsModal
          isOpen={selected !== null}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          sourceChainId={selected.sourceChainId}
          destinationChainId={selected.destinationChainId}
          bridges={selected.bridges}
        />
      )}
    </>
  );
}

import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import type { Network } from "@/lib/types";

/**
 * The page's network from the URL: `?network=testnet`, else Mainnet (the default, which the URL leaves out), so a
 * page can be linked to and screenshotted on either network. Setting it keeps the other query parameters and
 * replaces the history entry.
 */
export function useNetworkParam(): [Network, (next: Network) => void] {
  const [params, setParams] = useSearchParams();
  const network: Network = params.get("network") === "testnet" ? "testnet" : "mainnet";
  const setNetwork = useCallback(
    (next: Network) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === "testnet") p.set("network", "testnet");
          else p.delete("network");
          return p;
        },
        { replace: true }
      );
    },
    [setParams]
  );
  return [network, setNetwork];
}

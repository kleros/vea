import { useEffect, useState } from "react";
import { fetchEpochs } from "@/lib/vea/client";
import type { VeaEpochRow, VeaRoute } from "@/lib/vea/types";

export function useVeaEpochs(routes: VeaRoute[]) {
  const [rows, setRows] = useState<VeaEpochRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    // Clear immediately so a filter change never leaves the previous
    // selection's rows (and their chain badges) on screen while the new
    // fetch is in flight.
    setRows([]);

    fetchEpochs(routes).then((result) => {
      if (cancelled) return;
      if (result === null) {
        setError("Could not reach the Vea indexer.");
        setRows([]);
      } else {
        setRows(result);
      }
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [routes]);

  return { rows, isLoading, error };
}

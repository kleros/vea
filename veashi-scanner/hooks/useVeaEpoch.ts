import { useEffect, useState } from "react";
import { fetchEpochDetail, VeaIndexerError } from "@/lib/vea/client";
import type { VeaEpochRow, VeaMessageRow, VeaRoute } from "@/lib/vea/types";

export function useVeaEpoch(route: VeaRoute, epoch: number) {
  const [row, setRow] = useState<VeaEpochRow | null>(null);
  const [messages, setMessages] = useState<VeaMessageRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchEpochDetail(route, epoch)
      .then((result) => {
        if (cancelled) return;
        if (result === null) {
          setError("Epoch not found.");
          setRow(null);
          setMessages([]);
        } else {
          setRow(result.row);
          setMessages(result.messages);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof VeaIndexerError ? err.message : "Epoch not found.");
        setRow(null);
        setMessages([]);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [route, epoch]);

  return { row, messages, isLoading, error };
}

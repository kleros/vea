import { useState, useEffect } from "react";
import type { Message } from "@/lib/types";
import { YaruAbi, getYaru } from "@kleros/veashi-sdk";
import { createPublicClient, http } from "viem";
import { getViemChain, getRpcUrl } from "@/lib/chains";

export type ExecutionStatus = "pending" | "executed";

/** How often to re-check on-chain execution while still pending. */
const POLL_INTERVAL_MS = 10_000;

export function useExecutionStatus(message: Message | null | undefined) {
  const [status, setStatus] = useState<ExecutionStatus>("pending");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!message?.messageId || !message?.destinationChain) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    async function fetchStatus() {
      setIsLoading(true);

      let executed = false;

      try {
        if (!message) throw new Error("Message");
        const chain = getViemChain(message.destinationChain);
        const publicClient = createPublicClient({
          transport: http(getRpcUrl(message.destinationChain)),
          chain,
        });
        const yaruAddress = getYaru(message.sourceChain, message.destinationChain) as `0x${string}`;
        executed = (await publicClient.readContract({
          address: yaruAddress,
          abi: YaruAbi,
          functionName: "executed",
          args: [message.messageId],
        })) as boolean;

        if (cancelled) return;
        setStatus(executed ? "executed" : "pending");
        setError(null);
      } catch (err) {
        // A failed RPC call means we don't know the execution status this
        // tick — it does NOT mean execution itself failed (this contract call
        // only ever returns true/false, never a "failed" state). Leave the
        // last-known status as-is and surface the error separately so the UI
        // can show "still checking" rather than a misleading final state.
        console.error("Failed to check execution status from contract:", err);
        if (!cancelled) setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        if (!cancelled) setIsLoading(false);
      }

      // Once executed, that can't revert on-chain — stop polling.
      if (!cancelled && !executed) {
        timeoutId = setTimeout(fetchStatus, POLL_INTERVAL_MS);
      }
    }

    fetchStatus();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [message]);

  return { status, isLoading, error };
}

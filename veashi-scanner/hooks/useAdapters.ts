import { useState, useEffect } from "react";
import { createPublicClient, http, type Address, type Abi } from "viem";
import { Status, type Message, type StatusesRecord } from "@/lib/types";
import { AdapterAbi } from "@kleros/veashi-sdk";
import { getViemChain, getRpcUrl } from "@/lib/chains";

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

// Merge into the previous statuses rather than replacing them: a per-adapter
// RPC failure here just means "unknown this poll", not "not relayed" — it
// must not downgrade an already-CONFIRMED adapter back to PENDING just
// because this tick's call for it errored.
//
// Note: a rate-limited/failed RPC call does NOT make `multicall()` itself
// throw — viem resolves normally with a per-contract `results` array where
// the affected entries have `status: "failure"`. So failures must be
// detected here, not just in the caller's try/catch.
function mergeAdapterStatuses<T extends { status: "success"; result: unknown } | { status: "failure"; error: unknown }>(
  prev: StatusesRecord,
  adapters: string[],
  results: readonly T[]
): { merged: StatusesRecord; failedCount: number } {
  const merged: StatusesRecord = { ...prev };
  let failedCount = 0;
  adapters.forEach((adapter, index) => {
    const result = results[index];
    if (result.status === "success") {
      const hash = result.result as string;
      merged[adapter] = hash && hash !== ZERO_BYTES32 ? Status.CONFIRMED : Status.PENDING;
    } else {
      failedCount += 1;
      console.error(`Adapter ${adapter} failed:`, result.error);
    }
  });
  return { merged, failedCount };
}

/**
 * @param isExecuted Whether the message has already been executed on the
 * destination chain (from `useExecutionStatus`). Once executed AND enough
 * adapters have confirmed to meet the threshold, nothing the user cares
 * about can change further — a slower, non-required adapter confirming
 * later isn't worth polling for.
 */
export function useAdapterStatuses(message: Message, isExecuted = false) {
  const [statuses, setStatuses] = useState<StatusesRecord>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Check if we have the necessary data to query
    if (!message?.adapters?.length) return;
    if (message.sourceChain === undefined || message.nonce === undefined) return;

    let cancelled = false;
    let inFlight = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const fetchStatuses = async () => {
      // Skip this poll tick if the previous one hasn't resolved yet — a slow
      // or retrying RPC call shouldn't pile up overlapping requests whose
      // out-of-order responses could overwrite a newer result with a stale one.
      if (inFlight) return;
      inFlight = true;

      setIsLoading(true);
      setError(null);

      let shouldStopPolling = false;

      try {
        const chain = getViemChain(message.destinationChain);
        const publicClient = createPublicClient({
          transport: http(getRpcUrl(message.destinationChain)),
          chain,
        });

        if (!message.sourceChain || !message.messageId || !message.adapters) {
          throw new Error("Hashi message not constructed");
        }

        const domain = BigInt(message.sourceChain);
        const id = BigInt(message.messageId);

        // Prepare the contract calls for multicall
        const contracts = message.adapters.map((adapter) => ({
          address: adapter as Address,
          abi: AdapterAbi as Abi,
          functionName: "getHash",
          args: [domain, id] as const,
        }));

        // Execute all getHash calls in a single RPC request
        const results = await publicClient.multicall({
          contracts,
        });

        if (cancelled) return;

        let failedCount = 0;
        setStatuses((prev) => {
          const result = mergeAdapterStatuses(prev, message.adapters!, results);
          failedCount = result.failedCount;

          const confirmedCount = message.adapters!.filter(
            (adapter) => result.merged[adapter] === Status.CONFIRMED
          ).length;
          const allConfirmed = confirmedCount === message.adapters!.length;
          const thresholdMet = confirmedCount >= message.thresholdRequired;

          // Stop once every adapter has confirmed, or once the threshold is
          // met and the message is already executed — either way, nothing
          // left that could change (a slower, non-required adapter
          // confirming later isn't worth polling for).
          shouldStopPolling = allConfirmed || (thresholdMet && isExecuted);

          return result.merged;
        });

        // `multicall` resolves even when every call in the batch failed (e.g.
        // rate-limited) — surface that as an error instead of silently
        // treating the missing results as "genuinely unconfirmed".
        if (failedCount > 0) {
          setError(new Error(`${failedCount} adapter call(s) failed`));
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to fetch adapter statuses:", err);
        setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        inFlight = false;
        if (!cancelled) setIsLoading(false);
      }

      if (!cancelled && !shouldStopPolling) {
        timeoutId = setTimeout(fetchStatuses, 10000);
      }
    };

    fetchStatuses();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [message, isExecuted]);

  return { statuses, isLoading, error };
}

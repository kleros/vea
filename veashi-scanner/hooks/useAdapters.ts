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
function mergeAdapterStatuses(
  prev: StatusesRecord,
  adapters: string[],
  results: Awaited<ReturnType<ReturnType<typeof createPublicClient>["multicall"]>>
): StatusesRecord {
  const merged: StatusesRecord = { ...prev };
  adapters.forEach((adapter, index) => {
    const result = results[index];
    if (result.status === "success") {
      const hash = result.result as string;
      merged[adapter] = hash && hash !== ZERO_BYTES32 ? Status.CONFIRMED : Status.PENDING;
    } else {
      console.error(`Adapter ${adapter} failed:`, result.error);
    }
  });
  return merged;
}

export function useAdapterStatuses(message: Message) {
  const [statuses, setStatuses] = useState<StatusesRecord>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Check if we have the necessary data to query
    if (!message?.adapters?.length) return;
    if (message.sourceChain === undefined || message.nonce === undefined) return;

    let cancelled = false;
    let inFlight = false;

    const fetchStatuses = async () => {
      // Skip this poll tick if the previous one hasn't resolved yet — a slow
      // or retrying RPC call shouldn't pile up overlapping requests whose
      // out-of-order responses could overwrite a newer result with a stale one.
      if (inFlight) return;
      inFlight = true;

      setIsLoading(true);
      setError(null);

      try {
        const chain = getViemChain(message.destinationChain);
        console.log(chain?.name);
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

        setStatuses((prev) => mergeAdapterStatuses(prev, message.adapters!, results));
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to fetch adapter statuses:", err);
        setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        inFlight = false;
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchStatuses();

    const intervalId = setInterval(fetchStatuses, 10000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [message]);

  return { statuses, isLoading, error };
}

import { useState, useEffect } from "react";
import { createPublicClient, http, type Address, type Abi } from "viem";
import { Status, type Message, type StatusesRecord } from "@/lib/types";
import { AdapterAbi } from "@kleros/veashi-sdk";
import { getViemChain } from "@/lib/chains";

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

export function useAdapterStatuses(message: Message) {
  const [statuses, setStatuses] = useState<StatusesRecord>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Check if we have the necessary data to query
    if (!message || !message.adapters || message.adapters.length === 0) return;
    if (message.sourceChain === undefined || message.nonce === undefined) return;

    const fetchStatuses = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const chain = getViemChain(message.destinationChain);
        console.log(chain?.name);
        const publicClient = createPublicClient({
          transport: http(),
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

        // Parse the results back to the adapter addresses
        const newStatuses: StatusesRecord = {};
        message.adapters.forEach((adapter, index) => {
          const result = results[index];
          if (result.status === "success") {
            const hash = result.result as string;
            newStatuses[adapter] = hash && hash !== ZERO_BYTES32 ? Status.CONFIRMED : Status.PENDING;
          } else {
            console.error(`Adapter ${adapter} failed:`, result.error);
            newStatuses[adapter] = Status.PENDING;
          }
        });

        setStatuses(newStatuses);
      } catch (err) {
        console.error("Failed to fetch adapter statuses:", err);
        setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatuses();

    const intervalId = setInterval(fetchStatuses, 10000);
    return () => clearInterval(intervalId);
  }, [message]);

  return { statuses, isLoading, error };
}

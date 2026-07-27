import { useState, useEffect } from "react";
import type { Message } from "@/lib/types";
import { YaruAbi, getYaru } from "@kleros/veashi-sdk";
import { createPublicClient, http } from "viem";
import { getViemChain, getRpcUrl } from "@/lib/chains";

export type ExecutionStatus = "pending" | "executed" | "failed";

export function useExecutionStatus(message: Message | null | undefined) {
  const [status, setStatus] = useState<ExecutionStatus>("pending");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!message?.messageId || !message?.destinationChain) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    async function fetchStatus() {
      setIsLoading(true);
      try {
        if (!message) throw new Error("Message");
        const chain = getViemChain(message.destinationChain);
        const publicClient = createPublicClient({
          transport: http(getRpcUrl(message.destinationChain)),
          chain,
        });
        const yaruAddress = getYaru(message.sourceChain, message.destinationChain) as `0x${string}`;
        const isExecuted = await publicClient.readContract({
          address: yaruAddress,
          abi: YaruAbi,
          functionName: "executed",
          args: [message.messageId],
        });

        if (isMounted) {
          setStatus(isExecuted ? "executed" : "pending");
        }
      } catch (error) {
        console.error("Failed to check execution status from contract:", error);
        if (isMounted) setStatus("failed");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchStatus();

    return () => {
      isMounted = false;
    };
  }, [message]);

  // Return just the status and loading state
  return { status, isLoading };
}

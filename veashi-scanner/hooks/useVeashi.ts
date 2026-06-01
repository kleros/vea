// import { useState, useEffect, useCallback } from "react";
// import { PublicClient, parseAbi } from "viem";
// // Importing from the SDK you built
// import { getAllMessageDispatchedLogs } from "../lib/hashi";

// // Minimal ABI strictly for checking delivery status on the Adapter
// const ADAPTER_ABI = parseAbi([
//   "function isMessageDelivered(bytes32 messageId) external view returns (bool)",
// ]);

// // Define your types based on your SDK's output
// interface RouteMessage {
//   messageId: string;
//   sender: string;
//   destination: string;
//   adapterAddress: `0x${string}`;
// }

// export const useVeashiScanner = (
//   routeId: string | undefined,
//   destinationClient: PublicClient, // Viem client for the destination chain
// ) => {
//   const [messages, setMessages] = useState<RouteMessage[]>([]);
//   const [deliveryStatuses, setDeliveryStatuses] = useState<
//     Record<string, boolean>
//   >({});

//   const [isLoadingMessages, setIsLoadingMessages] = useState(false);
//   const [isLoadingStatuses, setIsLoadingStatuses] = useState(false);
//   const [error, setError] = useState<string | null>(null);

//   // 1. Fetch the core messages for the route via the SDK
//   const fetchMessages = useCallback(async () => {
//     if (!routeId) return;

//     setIsLoadingMessages(true);
//     setError(null);

//     try {
//       // Replace with your SDK's actual method
//       const routeData = await getAllMessageDispatchedLogs(routeId);
//       setMessages(routeData);
//     } catch (err) {
//       console.error("Failed to fetch route messages:", err);
//       setError("Failed to load route data.");
//     } finally {
//       setIsLoadingMessages(false);
//     }
//   }, [routeId]);

//   // 2. Fetch delivery statuses concurrently via Viem
//   const fetchDeliveryStatuses = useCallback(async () => {
//     if (messages.length === 0) return;

//     setIsLoadingStatuses(true);

//     try {
//       // Create an array of viem readContract promises
//       const statusPromises = messages.map(async (msg) => {
//         const isDelivered = await destinationClient.readContract({
//           address: msg.adapterAddress,
//           abi: ADAPTER_ABI,
//           functionName: "isMessageDelivered",
//           args: [msg.messageId as `0x${string}`],
//         });

//         return { messageId: msg.messageId, isDelivered };
//       });

//       // Use allSettled so one failed RPC call doesn't break the whole batch
//       const results = await Promise.allSettled(statusPromises);

//       const newStatuses: Record<string, boolean> = {};

//       results.forEach((result) => {
//         if (result.status === "fulfilled") {
//           newStatuses[result.value.messageId] = result.value
//             .isDelivered as boolean;
//         } else {
//           console.error("Failed to fetch status for a message:", result.reason);
//           // Optionally handle individual failures here
//         }
//       });

//       setDeliveryStatuses((prev) => ({ ...prev, ...newStatuses }));
//     } catch (err) {
//       console.error("Error checking delivery statuses:", err);
//     } finally {
//       setIsLoadingStatuses(false);
//     }
//   }, [messages, destinationClient]);

//   // Trigger message fetching when routeId changes
//   useEffect(() => {
//     fetchMessages();
//   }, [fetchMessages]);

//   // Trigger status fetching whenever new messages are loaded
//   useEffect(() => {
//     fetchDeliveryStatuses();
//   }, [fetchDeliveryStatuses]);

//   return {
//     messages,
//     deliveryStatuses,
//     isLoading: isLoadingMessages || isLoadingStatuses,
//     error,
//     refetch: fetchMessages, // Expose refetch for manual UI refresh
//   };
// };

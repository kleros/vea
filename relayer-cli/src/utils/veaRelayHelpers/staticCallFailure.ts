import { isRevertError } from "./revertClass";

/**
 * What a relay run does with a message whose `sendMessage.staticCall` failed:
 * - "stop": a transport failure. Send the messages already collected and resume from this message.
 * - "skip": a revert while the outbox count is unchanged. The message cannot be relayed (bad proof, already relayed,
 *   or its receiver reverts), so it is skipped for good.
 * - "drop": a revert after the outbox count changed. Every proof of the current batch was built for the old count,
 *   so the batch is not sent and the run resumes from its first message.
 */
export type StaticCallFailureAction = "stop" | "skip" | "drop";

/**
 * Decide what to do with a message whose `sendMessage.staticCall` failed.
 * @param error The staticCall error
 * @param count The outbox count the message's proof was built for
 * @param readCount Reads the outbox count again; only called for a revert, and its errors propagate
 * @returns The action for the message
 */
export const decideStaticCallFailure = async (
  error: unknown,
  count: number,
  readCount: () => Promise<number>
): Promise<StaticCallFailureAction> => {
  if (!isRevertError(error)) return "stop";
  const currentCount = await readCount();
  return currentCount === count ? "skip" : "drop";
};

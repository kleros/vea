import { TxCardProps } from "components/SnapshotAccordion/AccordionBody/TxCard";
import { bridges } from "consts/bridges";
import { InboxData, OutboxData } from "hooks/useSnapshots";
import { formatTimestampToHumanReadable } from "./formatTimestampToHumanReadable";

export interface IStatus {
  honest: boolean;
  claimed: boolean;
  challenged: boolean;
  resolving: boolean;
  resolved: boolean;
}

export interface IParsedData {
  bridgeIndex: number;
  epoch: string;
  snapshotId: string;
  status: IStatus;
  transactions: TxCardProps[];
}

export const mapDataForAccordion = (
  snapshotsData: [InboxData, OutboxData][]
): IParsedData[] => {
  return snapshotsData.map(([inboxData, outboxData]): IParsedData => {
    const bridgeInfo = bridges[inboxData?.bridgeIndex];
    return {
      bridgeIndex: inboxData.bridgeIndex,
      epoch: inboxData.epoch,
      snapshotId: inboxData.id,
      status: {
        claimed: typeof outboxData?.txHash !== "undefined",
        challenged: outboxData?.challenged,
        resolving: inboxData.resolving,
        resolved: typeof outboxData?.verification?.txHash !== "undefined",
        honest: outboxData?.honest,
      },
      transactions: [
        {
          title: "Creator",
          chain: bridgeInfo?.from,
          txHash: inboxData?.txHash,
          timestamp: formatTimestampToHumanReadable(inboxData?.timestamp),
          caller: inboxData?.caller,
          extraFields: [
            {
              key: "State Root",
              value: inboxData?.stateRoot,
              isCopy: true,
            },
          ],
        },
        outboxData?.txHash && {
          title: "Oracle",
          chain: bridgeInfo?.to,
          txHash: outboxData?.txHash,
          timestamp: formatTimestampToHumanReadable(outboxData?.timestamp),
          caller: outboxData?.bridger,
          extraFields: [
            {
              key: "State Root",
              value: outboxData?.stateroot,
              isCopy: true,
            },
          ],
        },
        outboxData?.challenge?.txHash && {
          title: "Challenger",
          chain: bridgeInfo?.to,
          txHash: outboxData?.challenge?.txHash,
          timestamp: formatTimestampToHumanReadable(
            outboxData?.challenge?.timestamp
          ),
          caller: outboxData?.challenge?.challenger,
        },
        inboxData?.fallback[0]?.txHash && {
          title: "Fallback Sender",
          chain: bridgeInfo?.from,
          txHash: inboxData?.fallback[0]?.txHash,
          timestamp: formatTimestampToHumanReadable(
            inboxData?.fallback[0]?.timestamp
          ),
          caller: inboxData?.fallback[0]?.executor,
        },
        outboxData?.verification?.txHash && {
          title: outboxData?.challenge?.txHash
            ? "Fallback Executor"
            : "Verifier",
          chain: bridgeInfo?.to,
          txHash: outboxData?.verification?.txHash,
          timestamp: formatTimestampToHumanReadable(
            outboxData?.verification?.timestamp
          ),
          caller: outboxData?.verification?.caller,
        },
      ],
    };
  });
};

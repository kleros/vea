import { ITxCard } from "components/SnapshotAccordion/AccordionBody/TxCard";
import { bridges } from "consts/bridges";
import { formatTimestampToHumanReadable } from "./formatTimestampToHumanReadable";
import { InboxData, OutboxData } from "hooks/useSnapshots";
import { useFiltersContext } from "contexts/FiltersContext";

export interface IStatus {
  claimed: boolean;
  verified: boolean;
  challenged: boolean;
  resolving: boolean;
  resolved: boolean;
}

// In respect to statusFilter values
export enum ClaimStatus {
  UNKNOWN = -1,
  CLAIMED = 1,
  CHALLENGED = 2,
  VERIFIED = 3,
  RESOLVING = 4,
  RESOLVED = 5,
}

export interface IParsedData {
  bridgeId: number;
  epoch: string;
  snapshotId: string;
  status: IStatus;
  currentStatus: ClaimStatus;
  transactions: ITxCard[];
}

export const mapDataForAccordion = (
  snapshotsData: [InboxData, OutboxData][]
): IParsedData[] => {
  const { statusFilter } = useFiltersContext();
  const data = snapshotsData.map(([inboxData, outboxData]): IParsedData => {
    const bridgeInfo = bridges[inboxData?.bridgeId];
    const transactions: ITxCard[] = [
      inboxData?.txHash
        ? {
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
          }
        : null,
      outboxData?.txHash
        ? {
            title: "Oracle",
            chain: bridgeInfo?.to,
            txHash: outboxData.txHash,
            timestamp: formatTimestampToHumanReadable(outboxData.timestamp),
            caller: outboxData.bridger,
            extraFields: [
              {
                key: "State Root",
                value: outboxData.stateroot,
                isCopy: true,
              },
            ],
          }
        : null,
      outboxData?.challenge?.txHash
        ? {
            title: "Challenger",
            chain: bridgeInfo?.to,
            txHash: outboxData.challenge.txHash,
            timestamp: formatTimestampToHumanReadable(
              outboxData.challenge.timestamp
            ),
            caller: outboxData.challenge.challenger,
          }
        : null,
      inboxData?.fallback &&
      Array.isArray(inboxData.fallback) &&
      inboxData.fallback.length > 0 &&
      inboxData.fallback[0]?.txHash
        ? {
            title: "Fallback Sender",
            chain: bridgeInfo?.from,
            txHash: inboxData.fallback[0].txHash,
            timestamp: formatTimestampToHumanReadable(
              inboxData.fallback[0].timestamp
            ),
            caller: inboxData.fallback[0].executor,
          }
        : null,
      outboxData?.verification?.txHash
        ? {
            title: outboxData?.challenge?.txHash
              ? "Fallback Executor"
              : "Verifier",
            chain: bridgeInfo?.to,
            txHash: outboxData.verification.txHash,
            timestamp: formatTimestampToHumanReadable(
              outboxData.verification.timestamp
            ),
            caller: outboxData.verification.caller,
          }
        : null,
    ].filter(Boolean) as ITxCard[];
    const status = {
      claimed: typeof outboxData?.txHash !== "undefined",
      verified: !outboxData?.challenged && outboxData?.verified,
      challenged: outboxData?.challenged,
      resolving: outboxData?.challenged && inboxData?.resolving,
      resolved: outboxData?.challenged && outboxData?.verified,
    };
    let currentStatus: ClaimStatus;
    if (status.resolved) {
      currentStatus = ClaimStatus.RESOLVED;
    } else if (status.resolving) {
      currentStatus = ClaimStatus.RESOLVING;
    } else if (status.challenged) {
      currentStatus = ClaimStatus.CHALLENGED;
    } else if (status.verified) {
      currentStatus = ClaimStatus.VERIFIED;
    } else if (status.claimed) {
      currentStatus = ClaimStatus.CLAIMED;
    } else {
      currentStatus = ClaimStatus.UNKNOWN;
    }

    return {
      bridgeId: inboxData.bridgeId,
      epoch: inboxData?.epoch || outboxData?.epoch,
      snapshotId: inboxData.id,
      status: {
        claimed: typeof outboxData?.txHash !== "undefined",
        verified: !outboxData?.challenged && outboxData?.verified,
        challenged: outboxData?.challenged,
        resolving: outboxData?.challenged && inboxData?.resolving,
        resolved: outboxData?.challenged && outboxData?.verified,
      },
      currentStatus,
      transactions,
    };
  });
  const filteredData =
    statusFilter !== 0
      ? data.filter((item) => item.currentStatus == statusFilter)
      : data;
  return filteredData;
};

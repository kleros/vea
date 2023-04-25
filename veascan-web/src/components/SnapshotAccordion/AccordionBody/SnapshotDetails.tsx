import React from "react";
import { bridges } from "~src/consts/bridges";
import { formatTimestampToHumanReadable } from "~src/utils/formatTimestampToHumanReadable";
import TxCard from "./TxCard";

export const statusRoles = {
  Taken: "Creator",
  Claimed: "Oracle",
  Verified: "Verifier",
  Challenged: "Challenger",
  Resolving: "Fallback Sender",
  Resolved: "Fallback Executor",
};

interface SnapshotDetailsProps {
  snapshotInboxData: any;
  snapshotOutboxData: any;
  snapshotStatus: any;
}

const SnapshotDetails: React.FC<SnapshotDetailsProps> = ({
  messageInboxData,
  messageOutboxData,
  snapshotInboxData,
  snapshotOutboxData,
  snapshotStatus,
}) => {
  const bridgeInfo = bridges[snapshotInboxData?.bridgeIndex];
  const snapshotDetailsParams = {
    title: statusRoles[snapshotStatus],
    chain: bridgeInfo?.from,
    txHash: snapshotInboxData?.txHash,
    timestamp: formatTimestampToHumanReadable(snapshotInboxData?.timestamp),
    caller: snapshotInboxData?.caller,
    extraFields: [
      {
        key: "State Root",
        value: snapshotInboxData?.stateRoot,
        isCopy: true,
      },
    ],
  };

  return (
    <div>
      <TxCard {...snapshotDetailsParams} />
    </div>
  );
};

export default SnapshotDetails;

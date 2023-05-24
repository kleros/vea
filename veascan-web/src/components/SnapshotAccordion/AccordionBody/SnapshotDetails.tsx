import { getBridge } from "consts/bridges";
import React from "react";
import { formatTimestampToHumanReadable } from "utils/formatTimestampToHumanReadable";
import { SnapshotInboxDataType } from "../AccordionTitle/AccordionTitle";

export const statusRoles = {
  Taken: "Creator",
  Claimed: "Oracle",
  Verified: "Verifier",
  Challenged: "Challenger",
  Resolving: "Fallback Sender",
  Resolved: "Fallback Executor",
};

interface SnapshotDetailsProps {
  snapshotInboxData: SnapshotInboxDataType;
  snapshotOutboxData: any;
  snapshotStatus: string;
}

const SnapshotDetails: React.FC<SnapshotDetailsProps> = ({
  messageInboxData,
  messageOutboxData,
  snapshotInboxData,
  snapshotOutboxData,
  snapshotStatus,
}) => {
  const bridgeInfo = getBridge(snapshotInboxData?.bridgeId);
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

  return <div></div>;
};

export default SnapshotDetails;

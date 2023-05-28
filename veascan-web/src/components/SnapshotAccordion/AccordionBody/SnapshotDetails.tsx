import React from "react";
import { bridges } from "consts/bridges";
import { SnapshotInboxDataType } from "../AccordionTitle/AccordionTitle";
import { formatTimestampToHumanReadable } from "utils/formatTimestampToHumanReadable";

export const statusRoles = {
  Taken: "Creator",
  Claimed: "Oracle",
  Verified: "Verifier",
  Challenged: "Challenger",
  Resolving: "Fallback Sender",
  Resolved: "Fallback Executor",
};

interface ISnapshotDetails {
  snapshotInboxData: SnapshotInboxDataType;
  snapshotOutboxData: any;
  snapshotStatus: string;
}

const SnapshotDetails: React.FC<ISnapshotDetails> = ({
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

  return <div></div>;
};

export default SnapshotDetails;

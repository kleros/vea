import { formatTimestampToHumanReadable } from "./formatTimestampToHumanReadable";
import { bridges } from "../consts/bridges";
import { useMessages } from "../hooks/useMessages";
import { formatDataForNewMessages } from "./formatDataForNewMessages";

export const formatDataForAccordion = (snapshotsData: any) => {
  const formattedDataForAccordion = snapshotsData.map(
    ([inboxData, outboxData]) => {
      const bridgeInfo = bridges[inboxData.bridgeIndex];
      const { data } = useMessages(
        inboxData.id,
        inboxData.bridgeIndex,
        0,
        false
      );
      console.log(data);
      return {
        titleProps: {
          epoch: inboxData.epoch,
          timestamp: formatTimestampToHumanReadable(inboxData.timestamp),
          fromChain: bridgeInfo.from,
          fromAddress: bridgeInfo.inboxAddress,
          toChain: bridgeInfo.to,
          toAddress: bridgeInfo.outboxAddress,
          status: "Resolved",
        },
        bodyProps: {
          snapshotDetailsProps: {
            title: "Verifier",
            chain: bridgeInfo.from,
            txHash: inboxData.txHash,
            timestamp: formatTimestampToHumanReadable(inboxData.timestamp),
            caller: inboxData.caller,
            extraFields: [
              {
                key: "State Root",
                value: inboxData.stateRoot,
                isCopy: true,
              },
            ],
          },
          newMessagesProps: data,
          bridgeInfo: bridgeInfo,
        },
      };
    }
  );
  return formattedDataForAccordion;
};

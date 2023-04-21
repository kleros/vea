import { formatTimestampToHumanReadable } from "./formatTimestampToHumanReadable";
import { bridges } from "../consts/bridges";

export const formatDataForAccordion = (data: any) => {
  const formattedDataForAccordion = data.map(([inboxData, outboxData]) => {
    const bridgeInfo = bridges[inboxData.bridgeIndex];
    const humanReadableTimestamp = formatTimestampToHumanReadable(
      inboxData?.timestamp
    );
    console.log(bridgeInfo);
    return {
      titleProps: {
        epoch: inboxData?.epoch,
        timestamp: humanReadableTimestamp,
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
          txHash: inboxData?.txHash,
          timestamp: humanReadableTimestamp,
          caller: "0x1234585f4ecaab46b138ec8d87238da442eeab9b",
          extraFields: [
            {
              key: "State Root",
              value: inboxData?.stateRoot,
              isCopy: true,
            },
          ],
        },
        newMessagesProps: {
          title: "Verifier",
          chain: bridgeInfo.from,
          txHash: inboxData?.txHash,
          timestamp: humanReadableTimestamp,
          caller: "0x1234585f4ecaab46b138ec8d87238da442eeab9b",
          extraFields: [
            {
              key: "State Root",
              value: inboxData?.stateRoot,
              isCopy: true,
            },
          ],
        },
      },
    };
  });
  return formattedDataForAccordion;
};

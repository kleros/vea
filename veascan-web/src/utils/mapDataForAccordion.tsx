import { formatTimestampToHumanReadable } from "./formatTimestampToHumanReadable";
import { formatDataForNewMessages } from "./formatDataForNewMessages";

export const mapDataForAccordion = (snapshotsData: any) => {
  const formattedDataForAccordion = snapshotsData.map(
    ([inboxData, outboxData]) => {
      return {
        titleProps: {
          inboxData: inboxData,
          outboxData: outboxData,
        },
        bodyProps: {
          inboxData: inboxData,
          outboxData: outboxData,
        },
      };
    }
  );
  return formattedDataForAccordion;
};

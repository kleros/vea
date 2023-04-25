import { formatTimestampToHumanReadable } from "./formatTimestampToHumanReadable";
import { formatDataForNewMessages } from "./formatDataForNewMessages";

export const mapDataForAccordion = (snapshotsData: any) => {
  const items = snapshotsData.map(([snapshotInboxData, snapshotOutboxData]) => {
    return {
      snapshotInboxData: snapshotInboxData,
      snapshotOutboxData: snapshotOutboxData,
    };
  });
  return items;
};

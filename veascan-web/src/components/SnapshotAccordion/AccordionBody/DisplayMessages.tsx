import { StandardPagination } from "@kleros/ui-components-library";
import React, { FC, useState } from "react";
import { useMessages } from "~src/hooks/useMessages";
import Message from "./Message";

interface DisplayMessagesProps {
  snapshotInboxData: any;
  snapshotOutboxData: any;
}

const MESSAGES_PER_PAGE = 5;

const DisplayMessages: FC<DisplayMessagesProps> = ({
  snapshotInboxData,
  snapshotOutboxData,
}) => {
  const [currentPage, setCurrentPage] = useState(1);

  const { data } = useMessages(
    snapshotInboxData.id,
    snapshotInboxData.bridgeIndex,
    (currentPage - 1) * MESSAGES_PER_PAGE,
    false
  );

  const totalMessages = parseInt(data?.totalMessages);
  const pageCount = Math.ceil(totalMessages / MESSAGES_PER_PAGE);

  return (
    <>
      {data?.messages.map(([messageInboxData, messageOutboxData]) => {
        return (
          <Message
            key={messageInboxData?.id}
            messageInboxData={messageInboxData}
            messageOutboxData={messageOutboxData}
            snapshotInboxData={snapshotInboxData}
            snapshotOutboxData={snapshotOutboxData}
          />
        );
      })}
      <StandardPagination
        currentPage={currentPage}
        callback={setCurrentPage}
        numPages={pageCount ? pageCount : currentPage}
      />
      ;
    </>
  );
};

export default DisplayMessages;

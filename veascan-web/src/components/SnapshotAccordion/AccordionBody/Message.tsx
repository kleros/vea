import { getBridge } from "consts/bridges";
import React, { useEffect, useState } from "react";
import { formatTimestampToHumanReadable } from "utils/formatTimestampToHumanReadable";
import MessageHeader from "./MessageHeader";
import TxCard from "./TxCard";

interface MessageProps {
  messageInboxData: MessageInboxDataType;
  messageOutboxData: any;
  bridgeId: number;
}

const messageStatusRoles = {
  Inboxed: "Sender",
  Relayed: "Relayer",
};

interface MessageInboxDataType {
  data: string;
  from: string;
  id: string;
  timestamp: string;
  to: string;
  txHash: string;
}

const Message: React.FC<MessageProps> = ({
  messageInboxData,
  messageOutboxData,
  bridgeId,
}) => {
  const [messageStatus, setMessageStatus] = useState("");
  const bridgeInfo = getBridge(bridgeId);

  useEffect(() => {
    calculateMessageStatus(messageOutboxData);
  }, [messageOutboxData]);

  const calculateMessageStatus = (messageOutboxData: any) => {
    if (!messageOutboxData) {
      setMessageStatus("Inboxed");
    } else {
      setMessageStatus("Relayed");
    }
  };

  return (
    <div key={messageInboxData?.id}>
      <MessageHeader
        status={messageStatus}
        messageNumber={parseInt(messageInboxData?.id)}
      />
      <TxCard
        title={messageStatusRoles[messageStatus]}
        chain={bridgeInfo?.from}
        txHash={messageInboxData?.txHash}
        timestamp={formatTimestampToHumanReadable(messageInboxData?.timestamp)}
        caller={messageInboxData?.from}
      />
    </div>
  );
};

export default Message;

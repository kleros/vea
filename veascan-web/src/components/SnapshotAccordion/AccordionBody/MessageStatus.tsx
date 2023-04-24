import React, { useEffect } from "react";
import styled from "styled-components";
import Document from "tsx:svgs/icons/document.svg";

interface MessageStatusProps {
  messageInboxData: any;
  messageOutboxData: any;
  messageStatus: string;
  setMessageStatus: any;
}

const Icon = styled.svg`
  width: 16px;
  height: 16px;
  fill: none;
`;

const Status = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  small {
    color: ${({ theme }) => theme.klerosUIComponentsPrimaryBlue} !important;
    font-weight: 600;
    line-height: 20px;
    font-size: 16px;
  }
  margin-top: 46px;
`;

const MessageStatus: React.FC<MessageStatusProps> = ({
  messageInboxData,
  messageOutboxData,
  messageStatus,
  setMessageStatus,
}) => {
  useEffect(() => {
    calculateMessageStatus(messageOutboxData);
  }, []);

  const calculateMessageStatus = (messageOutboxData: any) => {
    if (!messageOutboxData) {
      setMessageStatus("Inboxed");
    } else {
      setMessageStatus("Relayed");
    }
  };

  return (
    <Status>
      <Icon as={Document} />
      <small>
        Message #{messageInboxData.id} - {messageStatus}
      </small>
    </Status>
  );
};

export default MessageStatus;

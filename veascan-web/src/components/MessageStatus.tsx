import React from "react";
import styled from "styled-components";
import Document from "tsx:svgs/icons/document.svg";

interface MessageStatusProps {
  messageNumber: number;
  status: string;
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
`;

const MessageStatus: React.FC<MessageStatusProps> = ({
  messageNumber,
  status,
}) => {
  return (
    <Status>
      <Icon as={Document} />
      <small>
        Message #{messageNumber} - {status}
      </small>
    </Status>
  );
};

export default MessageStatus;

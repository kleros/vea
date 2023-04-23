import { Button } from "@kleros/ui-components-library";
import React, { useState } from "react";
import styled from "styled-components";
import { formatTimestampToHumanReadable } from "~src/utils/formatTimestampToHumanReadable";
import MessageStatus from "./MessageStatus";
import TxCard, { TxCardProps } from "./TxCard";

export interface AccordionBodyProps {
  snapshotDetailsProps: TxCardProps;
  newMessagesProps: any[];
  bridgeInfo: any;
}

const StyledSnapshotDetailsButton = styled(Button)<{
  snapshotDetailsVisible: boolean;
}>`
  background-color: ${({ theme }) => theme.color.midnightPurple};
  width: 141px;
  height: 31px;
  text-align: center;
  p {
    color: ${({ theme }) => theme.color.blue} !important;
    font-size: 14px !important;
    line-height: 17.5px !important;
    font-weight: normal !important;
  }
  :hover {
    background-color: ${({ theme }) => theme.color.midnightPurple};
  }
  border-radius: 300px;
  border: ${({ theme, snapshotDetailsVisible }) =>
    snapshotDetailsVisible ? "1px solid " + theme.color.blue : "none"};
`;

const StyledNewMessagesButton = styled(Button)<{
  snapshotDetailsVisible: boolean;
}>`
  background-color: ${({ theme }) => theme.color.midnightPurple};
  width: 130px;
  height: 31px;
  text-align: center;
  p {
    color: ${({ theme }) => theme.color.blue} !important;
    font-size: 14px !important;
    line-height: 17.5px !important;
    font-weight: normal !important;
  }

  :hover {
    background-color: ${({ theme }) => theme.color.midnightPurple};
  }

  margin-left: 8px;
  border-radius: 300px;
  border: ${({ theme, snapshotDetailsVisible }) =>
    !snapshotDetailsVisible ? "1px solid " + theme.color.blue : "none"};
`;

const StyledButtonsContainer = styled.div`
  display: flex;
  flex-direction: row;
  padding-bottom: 12px;
`;

const AccordionBody: React.FC<AccordionBodyProps> = (p) => {
  const [snapshotDetailsVisible, setSnapshotDetailsVisible] = useState(true);

  const handleClickSnapshotDetails = () => {
    setSnapshotDetailsVisible(true);
  };

  const handleClickNewMessages = () => {
    setSnapshotDetailsVisible(false);
  };

  return (
    <>
      <StyledButtonsContainer>
        <StyledSnapshotDetailsButton
          text={"Snapshot Details"}
          snapshotDetailsVisible={snapshotDetailsVisible}
          onClick={handleClickSnapshotDetails}
        />
        <StyledNewMessagesButton
          text={"New Messages"}
          snapshotDetailsVisible={snapshotDetailsVisible}
          onClick={handleClickNewMessages}
        />
      </StyledButtonsContainer>

      {snapshotDetailsVisible ? (
        <>
          <TxCard {...p.snapshotDetailsProps} />
        </>
      ) : (
        p.newMessagesProps?.map(([messageInboxData, messageOutboxData]) => {
          return (
            <div key={messageInboxData.id}>
              <MessageStatus
                messageNumber={messageInboxData.id}
                status="Relayed"
              />
              <TxCard
                title="Verifier"
                chain={p.bridgeInfo.from}
                txHash={messageInboxData.txHash}
                timestamp={formatTimestampToHumanReadable(
                  messageInboxData.timestamp
                )}
                caller="0x123"
              />
            </div>
          );
        })
      )}
    </>
  );
};

export default AccordionBody;

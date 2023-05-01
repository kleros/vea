import { Button } from "@kleros/ui-components-library";
import React, { useState } from "react";
import styled from "styled-components";
import { useMessages } from "src/hooks/useMessages";
import DisplayMessages from "./DisplayMessages";
import SnapshotDetails from "./SnapshotDetails";
import { SnapshotInboxDataType } from "../AccordionTitle/AccordionTitle";

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

export interface AccordionBodyProps {
  snapshotInboxData: SnapshotInboxDataType;
  snapshotOutboxData: any;
  snapshotStatus: any;
}

const AccordionBody: React.FC<AccordionBodyProps> = ({
  snapshotInboxData,
  snapshotOutboxData,
  snapshotStatus,
}) => {
  const [snapshotDetailsVisible, setSnapshotDetailsVisible] = useState(true);

  // new messages data
  const { data } = useMessages(
    snapshotInboxData.id,
    snapshotInboxData.bridgeIndex,
    0,
    false
  );

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
        <SnapshotDetails
          snapshotInboxData={snapshotInboxData}
          snapshotStatus={snapshotStatus}
          snapshotOutboxData={snapshotOutboxData}
        />
      ) : (
        <DisplayMessages
          snapshotInboxData={snapshotInboxData}
          snapshotOutboxData={snapshotOutboxData}
        />
      )}
    </>
  );
};

export default AccordionBody;

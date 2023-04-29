import { CustomAccordion } from "@kleros/ui-components-library";
import AccordionTitle from "./AccordionTitle/AccordionTitle";
import styled, { css } from "styled-components";
import React, { useState } from "react";
import AccordionBody from "./AccordionBody/AccordionBody";
import { smallScreenStyle } from "src/styles/smallScreenStyle";

const StyledSnapshotAccordionGlobal = styled(CustomAccordion)`
  display: flex;
  width: 100%;
  justify-content: center;
  padding-left: 32px;
  padding-right: 32px;

  ${smallScreenStyle(css`
    padding-left: 0px;
    padding-right: 0px;
  `)}

  .accordion-button {
    border: 1px solid ${({ theme }) => theme.color.secondaryBlue};
    border-radius: 3px;

    ${smallScreenStyle(css`
      justify-content: start;
      height: 139px;
      padding-left: 16px;
      padding-right: 16px;
    `)}
  }

  .accordion-svg {
    ${smallScreenStyle(css`
      align-self: end;
      margin-bottom: 9px;
      z-index: 100;
    `)}
  }

  .accordion-item__Body-sc-17yp2l-2.jjLCsn {
    background-color: ${({ theme }) => theme.color.secondaryPurple};
    border-right: 1px solid ${({ theme }) => theme.color.secondaryBlue};
    border-left: 1px solid ${({ theme }) => theme.color.secondaryBlue};
    border-bottom: 1px solid ${({ theme }) => theme.color.secondaryBlue};
    border-radius: 3px;

    ${smallScreenStyle(css`
      width: 100%;
      padding-left: 16px;
      padding-right: 16px;
    `)}
  }

  svg.accordion-svg path {
    fill: ${({ theme }) => theme.color.blue};
  }
`;

interface SnapshotAccordionProps {
  items: {
    snapshotInboxData: any;
    snapshotOutboxData: any;
  }[];
}

const SnapshotAccordion: React.FC<SnapshotAccordionProps> = (p) => {
  const [snapshotStatus, setSnapshotStatus] = useState("");

  return (
    <StyledSnapshotAccordionGlobal
      items={p.items.map((item, index) => ({
        key: index,
        title: (
          <AccordionTitle
            snapshotInboxData={item.snapshotInboxData}
            snapshotOutboxData={item.snapshotOutboxData}
            snapshotStatus={snapshotStatus}
            setSnapshotStatus={setSnapshotStatus}
          />
        ),
        body: (
          <AccordionBody
            snapshotInboxData={item.snapshotInboxData}
            snapshotOutboxData={item.snapshotOutboxData}
            snapshotStatus={snapshotStatus}
          />
        ),
      }))}
    />
  );
};

export default SnapshotAccordion;

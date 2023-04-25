import { CustomAccordion } from "@kleros/ui-components-library";
import AccordionTitle, {
  AccordionTitleProps,
} from "./AccordionTitle/AccordionTitle";
import styled from "styled-components";
import React, { useState } from "react";
import AccordionBody, {
  AccordionBodyProps,
} from "./AccordionBody/AccordionBody";

const StyledSnapshotAccordionGlobal = styled(CustomAccordion)`
  display: flex;
  width: auto;
  margin: 0 auto;

  button.accordion-button {
    border: 1px solid ${({ theme }) => theme.color.secondaryBlue};
    border-radius: 3px;
  }

  .accordion-item__Body-sc-17yp2l-2.jjLCsn {
    background-color: ${({ theme }) => theme.color.secondaryPurple};
    border-right: 1px solid ${({ theme }) => theme.color.secondaryBlue};
    border-left: 1px solid ${({ theme }) => theme.color.secondaryBlue};
    border-bottom: 1px solid ${({ theme }) => theme.color.secondaryBlue};
    border-radius: 3px;
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

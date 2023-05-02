import React from "react";
import styled from "styled-components";

const Timestamp: React.FC<{
  timestamp: string;
}> = (p) => {
  const StyledTimestamp = styled.div`
    color: ${({ theme }) => theme.color.lightBlue};
    white-space: nowrap;
  `;

  return <StyledTimestamp>{p.timestamp} </StyledTimestamp>;
};

export default Timestamp;

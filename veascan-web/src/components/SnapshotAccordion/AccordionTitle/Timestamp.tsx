import React from "react";
import styled from "styled-components";

const StyledTimestamp = styled.div`
  color: ${({ theme }) => theme.color.lightBlue};
  white-space: nowrap;
`;
const Timestamp: React.FC<{
  timestamp: string;
}> = (p) => {
  return <StyledTimestamp>{p.timestamp} </StyledTimestamp>;
};

export default Timestamp;

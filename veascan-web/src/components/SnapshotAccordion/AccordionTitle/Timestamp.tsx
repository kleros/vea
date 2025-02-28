import React from "react";
import styled from "styled-components";

const StyledTimestamp = styled.div`
  color: ${({ theme }) => theme.color.lightBlue};
  white-space: nowrap;
`;

interface ITimestamp {
  timestamp: string;
}

const Timestamp: React.FC<ITimestamp> = ({ timestamp }) => {
  return <StyledTimestamp>{timestamp} </StyledTimestamp>;
};

export default Timestamp;

import React from "react";
import styled from "styled-components";

const StyledEpoch = styled.div`
  color: ${({ theme }) => theme.color.lightBlue};
  width: 35%;
`;
const Epoch: React.FC<{
  epoch: string;
}> = (p) => {
  return <StyledEpoch>{p.epoch} </StyledEpoch>;
};

export default Epoch;

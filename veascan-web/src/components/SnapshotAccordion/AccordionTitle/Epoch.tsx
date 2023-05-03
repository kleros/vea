import React from "react";
import styled from "styled-components";

const Epoch: React.FC<{
  epoch: string;
}> = (p) => {
  const StyledEpoch = styled.div`
    color: ${({ theme }) => theme.color.lightBlue};
    width: 35%;
  `;

  return <StyledEpoch>{p.epoch} </StyledEpoch>;
};

export default Epoch;

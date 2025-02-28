import React from "react";
import styled from "styled-components";

const StyledEpoch = styled.div`
  color: ${({ theme }) => theme.color.lightBlue};
  width: 35%;
`;

interface IEpoch {
  epoch: string;
}

const Epoch: React.FC<IEpoch> = ({ epoch }) => {
  return <StyledEpoch>{epoch} </StyledEpoch>;
};

export default Epoch;

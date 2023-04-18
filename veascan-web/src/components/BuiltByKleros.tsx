import React from "react";
import styled from "styled-components";
import ImageBuiltByKleros from "tsx:svgs/built-by-kleros.svg";

const StyledKlerosLink = styled.a`
  width: fit-content;
  height: fit-content;
  line-height: 0;
  display: block;
  > svg {
    width: 180px;
    transition: transform 0.25s ease;

    :hover {
      transform: scale(1.05);
    }
  }
`;

const BuiltByKleros: React.FC<{ className?: string }> = ({ className }) => (
  <StyledKlerosLink
    href="https://www.kleros.io"
    target="_blank"
    rel="noopener noreferrer"
    {...{ className }}
  >
    <ImageBuiltByKleros />
  </StyledKlerosLink>
);

export default BuiltByKleros;

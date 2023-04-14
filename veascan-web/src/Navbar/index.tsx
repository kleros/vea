import React from "react";
import styled, { css } from "styled-components";
import { smallScreenStyle } from "styles/smallScreenStyle";
import Menu from "./Menu";
import SearchBar from "./SearchBar";

const Container = styled.div`
  height: 68px;
  position: sticky;
  top: 0px;
  z-index: 2;
  background-color: ${({ theme }) => theme.color.secondaryPurple};
  ${smallScreenStyle(css`
    height: calc(32px + (64 - 32) * (100vw - 300px) / (1250 - 300));
  `)}
  padding: 0 8%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 4px solid;
  border-image-slice: 1;
  ${({ theme }) => css`
    border-image-source: linear-gradient(
      to right,
      ${theme.color.blue},
      ${theme.color.pink}
    );
  `}
`;

const StyledTitle = styled.h5`
  width: 70.72px;
  font-size: 31.5px;
  margin-top: 20px;
  margin-bottom: 20px;
`;

const StyledSubtitle = styled.h5`
  color: ${({ theme }) => theme.color.lightBlue};
  font-size: 15.5px;
  padding-left: 14px;
  margin-top: 26.5px;
  margin-bottom: 24px;
`;

const StyledLogo = styled.div`
  display: flex;
  align-items: center;
`;

const Navbar: React.FC = () => {
  return (
    <Container>
      <StyledLogo>
        <StyledTitle>VeA</StyledTitle>
        <StyledSubtitle>explorer</StyledSubtitle>
      </StyledLogo>
      <StyledLogo>
        <SearchBar />
        <Menu />
      </StyledLogo>
    </Container>
  );
};

export default Navbar;

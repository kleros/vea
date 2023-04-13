import React from "react";
import styled, { css } from "styled-components";
import { smallScreenStyle } from "styles/smallScreenStyle";
import Menu from "./Menu";
import SearchBar from "./SearchBar";

const Container = styled.div`
  height: 64px;
  position: sticky;
  top: 0px;
  z-index: 2;
  background-color: #200f47;
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
  font-size: 28px;
`;

const StyledSubtitle = styled.h5`
  color: #becce5;
  font-size: 14px;
  padding-left: 4px;
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

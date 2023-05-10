import React, { forwardRef } from "react";
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

  ${smallScreenStyle(css`
    height: 136px;
    display: flex;
    flex-direction: column;
    align-items: start;
    padding: 0 6%;
  `)}
`;

const StyledTitle = styled.h5`
  font-size: 31.5px;
  margin-top: 20px;
  margin-bottom: 20px;

  ${smallScreenStyle(css`
    margin-bottom: 10px;
  `)}
`;

const StyledSubtitle = styled.h5`
  color: ${({ theme }) => theme.color.lightBlue};
  font-size: 15.5px;
  padding-left: 14px;
  margin-top: 26.5px;
  margin-bottom: 24px;

  ${smallScreenStyle(css`
    margin-bottom: 14px;
  `)}
`;

const StyledLogo = styled.div`
  display: flex;
  align-items: center;
`;

const Navbar = forwardRef((_, ref) => (
  <Container ref={ref}>
    <StyledLogo>
      <StyledTitle>VeA</StyledTitle>
      <StyledSubtitle>explorer</StyledSubtitle>
    </StyledLogo>
    <StyledLogo>
      <SearchBar />
      <Menu />
    </StyledLogo>
  </Container>
));
Navbar.displayName = "Navbar";

export default Navbar;

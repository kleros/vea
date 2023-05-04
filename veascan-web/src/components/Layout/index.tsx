import React from "react";
import styled, { css } from "styled-components";
import { smallScreenStyle } from "styles/smallScreenStyle";
import { useElementOffsets } from "hooks/useElementOffsets";
import Navbar from "./Navbar";
import Footer from "./Footer";

const MiddleContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0 auto;
  ${smallScreenStyle(css`
    margin: 0 5%;
  `)}
  max-width: 1120px;
`;

const Content = styled.div<{ navbarHeight: number }>`
  min-height: calc(100vh - ${({ navbarHeight }) => navbarHeight}px);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;

const Layout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [ref, { height: navbarHeight }] = useElementOffsets();
  return (
    <div>
      <Navbar ref={ref} />
      <Content {...{ navbarHeight }}>
        <MiddleContent> {children} </MiddleContent>
        <Footer />
      </Content>
    </div>
  );
};

export default Layout;

import React, { useRef } from "react";
import styled, { css } from "styled-components";
import { useClickAway, useToggle } from "react-use";
import QuestionIcon from "tsx:svgs/icons/question.svg";
import BugIcon from "tsx:svgs/icons/bug.svg";
import BookIcon from "tsx:svgs/icons/book.svg";
import OpenBookIcon from "tsx:svgs/icons/open-book.svg";
import MenuLink from "./MenuLink";
import { smallScreenStyle } from "styles/smallScreenStyle";

const ITEMS = [
  {
    text: "FAQ",
    Icon: QuestionIcon,
    url: "https://docs.vea.ninja/faq",
  },
  {
    text: "Report a Bug",
    Icon: BugIcon,
    url: "https://github.com/kleros/vea/issues",
  },
  {
    text: "Documentation",
    Icon: BookIcon,
    url: "https://docs.vea.ninja",
  },
  {
    text: "Devs Tutorial",
    Icon: OpenBookIcon,
    url: "https://docs.vea.ninja/build-xchain-dapps/getting-started",
  },
  {
    text: "Validators Tutorial",
    Icon: OpenBookIcon,
    url: "https://docs.vea.ninja/run-a-validator/getting-started",
  },
];

const Container = styled.div`
  display: flex;
  gap: 32px;
  padding-left: 32px;

  ${smallScreenStyle(css`
    padding-left: 24px;
    margin-bottom: 55px;
  `)}
`;

const Wrapper = styled.div`
  line-height: 0;
  position: relative;
`;

const MenuContainer = styled.div<{ isOpen: boolean }>`
  line-height: normal;
  position: absolute;
  min-width: 248px;
  top: calc(100% + 8px);
  right: 0;
  z-index: 1;
  background-color: ${({ theme }) => theme.color.secondaryPurple};
  border: 1px solid ${({ theme }) => theme.color.grey};
  box-shadow: 0px 2px 3px ${({ theme }) => theme.color.black + "03"};
  border-color: ${({ theme }) => theme.color.secondaryBlue};
  display: ${({ isOpen }) => (isOpen ? "flex" : "none")};
  flex-direction: column;
  gap: 24px;
  padding: 28px 16px;
`;

const StyledQuestion = styled(QuestionIcon)`
  height: 16px;
  transition: fill 0.25s ease;

  :hover {
    cursor: pointer;
    transform: scale(1.07);
    fill: ${({ theme }) => theme.color.blue};
  }
`;

const Menu: React.FC = () => {
  const ref = useRef(null);
  useClickAway(ref, () => {
    toggle(false);
  });

  const [isOpen, toggle] = useToggle(false);

  return (
    <Container>
      <Wrapper {...{ ref }}>
        <StyledQuestion onClick={() => toggle()} />
        <MenuContainer {...{ isOpen }}>
          {ITEMS.map((item, i) => (
            <MenuLink {...item} key={i} />
          ))}
        </MenuContainer>
      </Wrapper>
    </Container>
  );
};

export default Menu;

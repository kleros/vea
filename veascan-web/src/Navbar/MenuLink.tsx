import React from "react";
import styled from "styled-components";

const Container = styled.a`
  display: block;
  font-family: "Open Sans";
  color: ${({ theme }) => theme.color.lightBlue};
  text-decoration: none;
  svg {
    max-height: 16px;
    max-width: 16px;
    margin-right: 8px;
    fill: ${({ theme }) => theme.color.lightBlue};
  }

  :hover {
    cursor: pointer;
    color: ${({ theme }) => theme.color.blue};
    transform: scale(1.0025);

    svg {
      fill: ${({ theme }) => theme.color.blue};
    }
  }
`;

interface IQuestionLink {
  text: string;
  url: string;
  Icon: React.FC<React.SVGAttributes<SVGElement>>;
}

const MenuLink: React.FC<IQuestionLink> = ({ text, url, Icon }) => {
  return (
    <Container href={url} target="_blank" rel="noopener noreferrer">
      <Icon />
      <small>{text}</small>
    </Container>
  );
};

export default MenuLink;

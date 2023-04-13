import React from "react";
import styled from "styled-components";

const Container = styled.a`
  display: block;
  font-family: "Open Sans";
  color: #becce5;
  text-decoration: none;
  svg {
    max-height: 16px;
    max-width: 16px;
    margin-right: 8px;
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

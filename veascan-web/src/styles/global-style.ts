import { createGlobalStyle, css } from "styled-components";
import { smallScreenStyle } from "styles/smallScreenStyle";

export const GlobalStyle = createGlobalStyle`
  html {
    box-sizing: border-box;
    margin: 0px;
  }
  *, *:before, *:after {
    box-sizing: inherit;
    margin: 0px;
  }
  body {
    font-family: "Oxanium", sans-serif;
    background-color: ${({ theme }) => theme.color.dark};
  }
  h1 {
    font-family: "Major Mono Display";
    font-size: 6rem;
    ${smallScreenStyle(css`
      font-size: calc(64px + (98 - 64) * (100vw - 300px) / (1250 - 300));
    `)}
    font-weight: 600;
    color: ${({ theme }) => theme.color.white};
  }
  h2 {
    font-family: "Major Mono Display";
    font-size: 3rem;
    ${smallScreenStyle(css`
      font-size: calc(32px + (48 - 32) * (100vw - 300px) / (1250 - 300));
    `)}
    font-weight: 400;
    color: ${({ theme }) => theme.color.white};
  }
  h3 {
    font-family: "Major Mono Display";
    font-size: 2rem;
    ${smallScreenStyle(css`
      font-size: calc(24px + (32 - 24) * (100vw - 300px) / (1250 - 300));
    `)}
    font-weight: 600;
    color: ${({ theme }) => theme.color.white};
  }
  h4 {
    font-family: "Major Mono Display";
    font-size: 2rem;
    ${smallScreenStyle(css`
      font-size: calc(24px + (32 - 24) * (100vw - 300px) / (1250 - 300));
    `)}
    font-weight: 400;
    color: ${({ theme }) => theme.color.white};
  }
  h5 {
    font-family: "Major Mono Display";
    font-size: 1.5rem;
    ${smallScreenStyle(css`
      font-size: calc(16px + (24 - 16) * (100vw - 300px) / (1250 - 300));
    `)}
    font-weight: 400;
    color: ${({ theme }) => theme.color.white};
  }
  p {
    line-height: 1.25rem;
    font-size: 1.25rem;
    ${smallScreenStyle(css`
      font-size: calc(16px + (24 - 16) * (100vw - 300px) / (1250 - 300));
    `)}
    font-weight: 300;
    color: ${({ theme }) => theme.color.white};
  }
  small {
    font-size: 16px;
    line-height: 20px;
    font-weight: 400;
    font-family: "Oxanium";
    color: ${({ theme }) => theme.color.white};
  }
  label{
  font-size: 16px;
  line-height: 20px;
  font-weight: 600;
  font-family: "Oxanium";
  color: ${({ theme }) => theme.color.pink} !important;
  }
  button {
    all: unset;
    box-sizing: border-box;
    :hover {
      cursor: pointer;
    }
  }
  hr {
    opacity: 1;
  }
  svg, img {
    display: inline-block;
    visibility: visible;
    vertical-align: middle;
  }
`;

import { css, FlattenInterpolation } from "styled-components";

export const smallScreenStyle = (style: FlattenInterpolation<string>) => css`
  @media (max-width: 1250px) {
    ${style.toString()}
  }
`;

import { css, FlattenInterpolation } from "styled-components";

export const mobileScreenStyle = (style: FlattenInterpolation<string>) => css`
  @media (max-width: 768px) {
    ${style.toString()}
  }
`;

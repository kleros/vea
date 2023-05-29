import React from "react";
import styled from "styled-components";
import { Tag } from "@kleros/ui-components-library";

interface IColoredLabel {
  variant: keyof typeof variantColors;
  text: string;
}

export const variantColors = {
  Invalid: "lightRed",
  Taken: "lightYellow",
  Claimed: "turquoise",
  Challenged: "lightPurple",
  Verified: "darkBlue",
  Expired: "smoke",
  Resolving: "teal",
  Resolved: "green",
};

const ColorWrapper = styled.div<{ variant: keyof typeof variantColors }>`
  div {
    background-color: ${({ theme, variant }) =>
      theme.color[variantColors[variant]]};
    pointer-events: none;
    p {
      color: ${({ theme }) => theme.color.secondaryPurple};
      font-size: 14px;
      line-height: 17.5px;
    }
    width: 100px;
  }
`;

const ColoredLabel: React.FC<IColoredLabel> = ({ text, variant, ...props }) => {
  return (
    <ColorWrapper {...{ variant, ...props }}>
      <Tag as="div" {...{ text }} />
    </ColorWrapper>
  );
};

export default ColoredLabel;

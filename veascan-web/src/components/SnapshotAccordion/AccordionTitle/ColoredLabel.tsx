import { Tag } from "@kleros/ui-components-library";
import React from "react";
import styled from "styled-components";

interface ColoredLabelProps {
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
  }
`;

const ColoredLabel: React.FC<ColoredLabelProps> = ({ text, variant }) => {
  return (
    <ColorWrapper {...{ variant }}>
      <Tag as="div" {...{ text }} />
    </ColorWrapper>
  );
};

export default ColoredLabel;

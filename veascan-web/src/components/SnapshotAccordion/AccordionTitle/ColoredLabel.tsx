import { Tag } from "@kleros/ui-components-library";
import React from "react";
import styled from "styled-components";

interface ColoredLabelProps {
  variant: keyof typeof variantColors;
  text: string;
}

const ColorTag = styled(Tag)<{ backgroundColor: string; text: string }>`
  background-color: ${({ theme, backgroundColor }) =>
    theme.color[backgroundColor]};
  pointer-events: none;
  p {
    color: ${({ theme }) => theme.color.secondaryPurple};
    font-size: 14px;
    line-height: 17.5px;
  }
`;

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

const ColoredLabel: React.FC<ColoredLabelProps> = ({ text, variant }) => {
  const backgroundColor = variantColors[variant];
  return <ColorTag as="div" text={text} backgroundColor={backgroundColor} />;
};

export default ColoredLabel;

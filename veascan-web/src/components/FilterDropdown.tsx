import { DropdownSelect } from "@kleros/ui-components-library";
import React from "react";
import styled from "styled-components";
import { theme } from "~src/styles/themes";

const ITEMS = [
  { text: "All", dot: "white", value: 1 },
  { text: "Invalid", dot: theme.color.lightRed, value: 2 },
  { text: "Taken", dot: theme.color.lightYellow, value: 3 },
  { text: "Claimed", dot: theme.color.turquoise, value: 4 },
  { text: "Challenged", dot: theme.color.lightPurple, value: 5 },
  { text: "Verified", dot: theme.color.darkBlue, value: 6 },
  { text: "Expired", dot: theme.color.smoke, value: 7 },
  { text: "Resolving", dot: theme.color.teal, value: 8 },
  { text: "Resolved", dot: theme.color.green, value: 9 },
];

const FilterItem = styled(DropdownSelect)`
  p {
    font-family: "Open Sans";
  }
`;

export const FilterDropdown = () => {
  return <FilterItem items={ITEMS} defaultValue={1} callback={() => {}} />;
};

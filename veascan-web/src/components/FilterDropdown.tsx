import { DropdownSelect } from "@kleros/ui-components-library";
import React from "react";
import styled from "styled-components";

const ITEMS = [
  { text: "All", dot: "white", value: 1 },
  { text: "Invalid", dot: "lightRed", value: 2 },
  { text: "Taken", dot: "lightYellow", value: 3 },
  { text: "Claimed", dot: "turquoise", value: 4 },
  { text: "Challenged", dot: "lightPurple", value: 5 },
  { text: "Verified", dot: "darkBlue", value: 6 },
  { text: "Expired", dot: "smoke", value: 7 },
  { text: "Resolving", dot: "teal", value: 8 },
  { text: "Resolved", dot: "green", value: 9 },
];

const FilterItem = styled(DropdownSelect)`
  p {
    font-family: "Open Sans";
  }
`;

export const FilterDropdown = () => {
  return (
    <div>
      <DropdownSelect
        items={ITEMS}
        defaultValue={1}
        callback={() => {
          // function called when an item is clicked with it's value as argument
        }}
      />
    </div>
  );
};

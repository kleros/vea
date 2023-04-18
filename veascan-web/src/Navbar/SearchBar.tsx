import React from "react";
import styled, { css } from "styled-components";
import SearchIcon from "tsx:svgs/icons/search.svg";
import { smallScreenStyle } from "styles/smallScreenStyle";

const Container = styled.div`
  height: 45px;
  margin-top: 9px;
  margin-bottom: 10px;
  width: 540px;
  display: flex;
  background-color: transparent;
  color: ${({ theme }) => theme.color.lightBlue};
  border: 1px solid #42498f;
  border-radius: 3px;

  ${smallScreenStyle(css`
    height: calc(32px + (45 - 32) * (100vw - 300px) / (1250 - 300));
  `)}

  ::placeholder {
    color: ${({ theme }) => theme.color.lightBlue};
  }
`;

const StyledInput = styled.input`
  position: relative;
  background-color: transparent;
  color: ${({ theme }) => theme.color.lightBlue};
  border: none;
  width: 540px;
  padding: 0px;

  font-family: "Oxanium";
  font-style: normal;
  font-weight: 400;
  font-size: 16px;

  ::placeholder {
    color: ${({ theme }) => theme.color.lightBlue};
  }

  :focus {
    outline: none;
  }
`;

const StyledSearchIcon = styled(SearchIcon)`
  padding: 13px;
`;

const SearchBar: React.FC = () => {
  // const snapshots = [
  //   {
  //     chain: "Arbitrum",
  //     epoch: "000000",
  //     txID: "0x1234585f4ecaab46b138ec8d87238da442eeab9b",
  //     timestamp: "1680680481",
  //     caller: "0x1234585f4ecaab46b138ec8d87238da442eeab9b",
  //     stateRoot: "0x1234585f4ecaab46b138ec8d87238da44b32eeab",
  //   },
  //   {
  //     chain: "Gnosis",
  //     epoch: "99999999999",
  //     txID: "0x9876585f4ecaab46b138ec8d87238da442eeab9b",
  //     timestamp: "5580680455",
  //     caller: "0x9876585f4ecaab46b138ec8d87238da442eeab9b",
  //     stateRoot: "0x0000085f4ecaab46b138ec8d87238da44b32eeab",
  //   },
  // ];
  //const [searchQuery, setSearchQuery] = useState("");
  //const [filteredSnapshots, setFilteredSnapshots] = useState<any[]>([]);

  // const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
  //   const { value } = event.target;
  //   setSearchQuery(value);

  //   const filtered = snapshots.filter((snapshot) => {
  //     const { epoch, txID, stateRoot } = snapshot;
  //     const lowerCaseQuery = value.toLowerCase();

  //     return (
  //       epoch.toLowerCase().includes(lowerCaseQuery) ||
  //       txID.toLowerCase().includes(lowerCaseQuery) ||
  //       stateRoot.toLowerCase().includes(lowerCaseQuery)
  //     );
  //   });

  //   setFilteredSnapshots(filtered);
  // };

  return (
    <Container>
      <StyledSearchIcon />
      <StyledInput
        type="text"
        //value={searchQuery}
        //onChange={handleInputChange}
        placeholder="Search by Epoch ID / Tx ID / Merkle root"
      />
    </Container>
  );
};

export default SearchBar;

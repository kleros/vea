import React, { useEffect, useState } from "react";
import styled, { css } from "styled-components";
import SearchIconLogo from "tsx:svgs/icons/search.svg";
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
  align-items: center;

  ::placeholder {
    color: ${({ theme }) => theme.color.lightBlue};
  }
  ${smallScreenStyle(css`
    margin-bottom: 64px;
    width: 302px;
  `)}
`;

const StyledInput = styled.input`
  position: relative;
  background-color: transparent;
  color: ${({ theme }) => theme.color.lightBlue};
  border: none;
  width: 540px;

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

  ${smallScreenStyle(css`
    margin-left: 4px;
  `)}
`;

const SearchIcon = styled.svg`
  width: 16px;
  height: 16px;
  margin-left: 16px;
  margin-top: 14px;
  margin-bottom: 15px;
`;

const SearchIconContainer = styled.div`
  width: 40px;
  height: 45px;
`;

const SearchBar: React.FC = () => {
  const [placeholder, setPlaceholder] = useState("");

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 950) {
        setPlaceholder("Search");
      } else {
        setPlaceholder("Search by Epoch ID / Tx ID / Merkle root");
      }
    };

    handleResize();

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);
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
      <SearchIconContainer>
        <SearchIcon as={SearchIconLogo} />
      </SearchIconContainer>

      <StyledInput
        type="text"
        //value={searchQuery}
        //onChange={handleInputChange}
        placeholder={placeholder}
      />
    </Container>
  );
};

export default SearchBar;

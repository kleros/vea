import React, { useEffect, useState } from "react";
import styled, { css } from "styled-components";
import SearchIconLogo from "tsx:svgs/icons/search.svg";
import { smallScreenStyle } from "styles/smallScreenStyle";

const Container = styled.div`
  height: 45px;
  margin-top: 9px;
  margin-bottom: 10px;
  display: flex;
  background-color: transparent;
  color: ${({ theme }) => theme.color.lightBlue};
  border: 1px solid #42498f;
  border-radius: 3px;
  align-items: center;
  width: 33.5vw;

  ::placeholder {
    color: ${({ theme }) => theme.color.lightBlue};
  }
  ${smallScreenStyle(css`
    width: 77.46vw;
  `)}
`;

const StyledInput = styled.input`
  position: relative;
  background-color: transparent;
  color: ${({ theme }) => theme.color.lightBlue};
  border: none;
  width: 33.5vw;
  margin-left: 4px;

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
    width: 77.46vw;
  `)}
`;

const SearchIcon = styled.svg`
  height: 16px;
  margin-left: 16px;
  margin-top: 14px;
  margin-bottom: 15px;
`;

const SearchIconContainer = styled.div`
  height: 45px;
`;

const SearchBar: React.FC = () => {
  const [placeholder, setPlaceholder] = useState("");

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 500) {
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

  return (
    <Container>
      <SearchIconContainer>
        <SearchIcon as={SearchIconLogo} />
      </SearchIconContainer>

      <StyledInput type="text" placeholder={placeholder} />
    </Container>
  );
};

export default SearchBar;

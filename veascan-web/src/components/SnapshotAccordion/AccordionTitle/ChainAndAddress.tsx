import React from "react";
import styled from "styled-components";

const StyledChainAndAddress = styled.div`
  position: relative;
  display: flex;
  flex-direction: row;
`;

const StyledTruncatedAddress = styled.a`
  display: flex;
  padding-top: 3.5px;
  color: ${({ theme }) => theme.color.blue};
  text-decoration: none;

  :hover {
    text-decoration: underline;
  }
`;

const ChainIcon = styled.svg`
  position: relative;
  width: 24px;
  height: 28px;
  fill: none;
  margin-right: 8px;
  padding-bottom: 2px;
`;
const ChainAndAddress: React.FC<{
  chainObject: any;
  address: string;
}> = (p) => {
  const truncatedAddress = `${p.address.slice(0, 6)}...${p.address.slice(-4)}`;

  return (
    <StyledChainAndAddress>
      <ChainIcon as={p.chainObject?.logo} />
      <StyledTruncatedAddress
        href={`${p.chainObject?.blockExplorers?.default.url}/address/${p.address}`}
        target="_blank"
        rel="noreferrer"
      >
        {truncatedAddress}
      </StyledTruncatedAddress>
    </StyledChainAndAddress>
  );
};

export default ChainAndAddress;

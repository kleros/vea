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

interface IChainAndAddress {
  chainObject: any;
  address: string;
}

const ChainAndAddress: React.FC<IChainAndAddress> = ({
  chainObject,
  address,
}) => {
  const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <StyledChainAndAddress>
      <ChainIcon as={chainObject?.logo} />
      <StyledTruncatedAddress
        href={`${chainObject?.blockExplorers?.default.url}/address/${address}`}
        target="_blank"
        rel="noreferrer"
      >
        {truncatedAddress}
      </StyledTruncatedAddress>
    </StyledChainAndAddress>
  );
};

export default ChainAndAddress;

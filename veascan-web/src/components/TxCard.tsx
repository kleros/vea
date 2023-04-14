import React from "react";
import styled from "styled-components";
import Copy from "tsx:../../public/tx-info/Copy.svg";
import ArbitrumLogo from "tsx:../assets/svgs/tx-info/ArbitrumLogo.svg";
import EthereumLogo from "tsx:../assets/svgs/tx-info/EthereumLogo.svg";

interface TxCardProps {
  title: string;
  chain: string;
  txHash: string;
  timestamp: string;
  caller: string;
  extraFields?: {
    [key: string]: string;
  };
}

const StyledDiv = styled.div`
  margin: 0px 32px;
  width: auto;
  .icon {
    width: 16px;
    height: 16px;
    fill: none;
    cursor: pointer;
  }

  .tx-header {
    font-size: 16px;
    line-height: 20px;
    font-weight: 600;
    font-family: "Oxanium";
    margin: 36px 0px 24px;
    color: ${({ theme }) => theme.color.pink} !important;
    width: fit-content;
  }
  .tx-info-text {
    font-size: 16px;
    line-height: 20px;
    font-weight: 400;
    font-family: "Oxanium";
    width: fit-content;
  }
  .tx-info-copyable {
    color: #6cc5ff !important;
  }
  .tx-info {
    display: grid;
    width: fit-content;
    grid-row: 2;
    gap: 108px;
  }
  .tx-info-titles {
    grid-column-start: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: fit-content;
  }
  .tx-info-data {
    grid-column-start: 2;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .border {
    margin: 24px 0px;
    background-color: "#42498F";
    border: 1px solid #42498f;
    height: 0px;
  }
`;

const ChainTag = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;
const CopyDiv = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
`;

export const TxCard: React.FC<TxCardProps> = ({
  title,
  chain,
  txHash,
  timestamp,
  caller,
  extraFields,
}) => {
  return (
    <StyledDiv>
      <h2 className="tx-header">{title}</h2>
      <div className="tx-info">
        <div className="tx-info-titles">
          <h3 className="tx-info-text">Chain</h3>
          <h3 className="tx-info-text">Transaction ID</h3>
          <h3 className="tx-info-text">Timestamp</h3>
          <h3 className="tx-info-text">Caller</h3>
          {extraFields &&
            Object.keys(extraFields).map((key) => (
              <h3 className="tx-info-text" key={key}>
                {key}
              </h3>
            ))}
        </div>
        <div className="tx-info-data">
          <ChainTag>
            {chain === "Ethereum" ? (
              <EthereumLogo className="icon" />
            ) : (
              <ArbitrumLogo className="icon" />
            )}
            <h2 className="tx-info-text">{chain}</h2>
          </ChainTag>
          <CopyDiv>
            <h3 className="tx-info-text tx-info-copyable">{txHash}</h3>
            <Copy className="icon" />
          </CopyDiv>
          <h3 className="tx-info-text">{timestamp}</h3>
          <CopyDiv>
            <p className="tx-info-text tx-info-copyable">{caller}</p>
            <Copy className="icon" />
          </CopyDiv>

          {extraFields &&
            Object.values(extraFields).map((value) => (
              <CopyDiv>
                <h3 className="tx-info-text" key={value}>
                  {value}
                </h3>
                <Copy className="icon" />
              </CopyDiv>
            ))}
        </div>
      </div>
      <hr className="border" />
    </StyledDiv>
  );
};

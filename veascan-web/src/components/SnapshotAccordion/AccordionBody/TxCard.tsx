import React from "react";
import styled from "styled-components";
import Copy from "tsx:svgs/icons/copy.svg";
import { getChain } from "consts/bridges";

interface Field {
  key: string;
  value: string;
  isCopy: boolean;
  url?: string;
}

export interface TxCardProps {
  title: string;
  chain: number;
  txHash: string;
  timestamp: string;
  caller: string;
  extraFields?: Field[];
}

const StyledDiv = styled.div`
  width: auto;
  .icon {
    width: 16px;
    height: 16px;
    fill: none;
    cursor: pointer;
  }
  .tx-info-copyable {
    color: ${({ theme }) => theme.klerosUIComponentsPrimaryBlue} !important;
    text-decoration: none;
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
    border: 1px solid ${({ theme }) => theme.klerosUIComponentsStroke};
    height: 0px;
  }
`;

const ValueDiv = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
  &.chain-info {
    gap: 4px;
  }
`;

const Icon = styled.svg`
  width: 16px;
  height: 16px;
  fill: none;
`;

const Header = styled.label`
  margin: 36px 0px 24px;
  width: fit-content;
  display: block;
`;

const TxCard: React.FC<TxCardProps> = ({
  title,
  chain,
  txHash,
  timestamp,
  caller,
  extraFields,
}) => {
  const chainObject = getChain(chain);
  const fields = [
    {
      key: "Chain",
      value: chainObject?.name,
      isCopy: false,
    },
    {
      key: "Transaction ID",
      value: txHash,
      isCopy: true,
      url: `${chainObject?.blockExplorers?.default.url}/tx/${txHash}`,
    },
    {
      key: "Timestamp",
      value: timestamp,
      isCopy: false,
    },
    {
      key: "Caller",
      value: caller,
      isCopy: true,
      url: `${chainObject?.blockExplorers?.default.url}/address/${caller}`,
    },
  ].concat(extraFields ?? []);

  return (
    <StyledDiv>
      <Header>{title}</Header>
      <div className="tx-info">
        <div className="tx-info-titles">
          {fields.map((section, index) => (
            <small key={index}>{section.key}</small>
          ))}
        </div>
        <div className="tx-info-data">
          {fields.map((section, index) => {
            if (section.key === "Chain") {
              return (
                <ValueDiv className="chain-info" key={index}>
                  <Icon as={chainObject?.logo} />
                  <small>{section.value}</small>
                </ValueDiv>
              );
            } else if (!section.isCopy) {
              return <small key={index}>{section.value}</small>;
            } else {
              return (
                <ValueDiv key={index}>
                  {section.url ? (
                    <a
                      href={section.url}
                      target="_blank"
                      style={{ textDecoration: "none" }}
                      rel="noreferrer"
                    >
                      <small className="tx-info-copyable">
                        {section.value}
                      </small>
                    </a>
                  ) : (
                    <small>{section.value}</small>
                  )}
                  <button>
                    <Icon
                      as={Copy}
                      onClick={() => {
                        navigator.clipboard.writeText(section.value!);
                      }}
                    />
                  </button>
                </ValueDiv>
              );
            }
          })}
        </div>
      </div>
      <hr className="border" />
    </StyledDiv>
  );
};

export default TxCard;

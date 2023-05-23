import React from "react";
import styled, { css } from "styled-components";
import { useCopyToClipboard } from "react-use";
import { smallScreenStyle } from "styles/smallScreenStyle";
import { getChain } from "consts/bridges";
import Copy from "tsx:svgs/icons/copy.svg";

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

  ${smallScreenStyle(css`
    width: 100%;
    word-wrap: break-word;
    margin-left: 2px;
  `)}

  .tx-info-copyable {
    color: ${({ theme }) => theme.klerosUIComponentsPrimaryBlue} !important;
    text-decoration: none;
  }
  .tx-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    ${smallScreenStyle(css`
      gap: 16px;
    `)}
    width: fit-content;
  }
  .tx-mobile-chain {
    display: grid;
    grid-row: 2;
    gap: 108px;
    width: fit-content;

    ${smallScreenStyle(css`
      display: flex;
      flex-direction: row;
      gap: 16px;
    `)};
  }
  .tx-info-layout {
    display: grid;
    grid-row: 2;
    gap: 108px;
    ${smallScreenStyle(css`
      display: flex;
      flex-direction: column;
      gap: 4px;
    `)}
    width: fit-content;
  }

  .tx-info-titles {
    grid-column-start: 1;
    display: inline-block;
    width: 12vw;
    gap: 4px;
    ${smallScreenStyle(css`
      width: auto;
    `)}
  }
  .tx-info-data {
    grid-column-start: 2;
    display: flex;
    flex-direction: column;
    width: auto;
    gap: 4px;
  }
  .border {
    margin: 24px 0px;
    border: 1px solid ${({ theme }) => theme.klerosUIComponentsStroke};
    height: 0px;
  }
`;

const InfoText = styled.small`
  color: ${({ theme }) => theme.color.smoke};
`;
const DataText = styled.small`
  color: ${({ theme }) => theme.klerosUIComponentsPrimaryText};
`;

const ValueDiv = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;

  ${smallScreenStyle(css`
    width: 100%;
    gap: 4px;
    word-break: break-all;
    &.chain-info {
      flex-direction: row;
      gap: 16px;
    }
  `)}

  .tx-copy-div {
    display: flex;
    gap: 9px;
    ${smallScreenStyle(css`
      display: block;
    `)}
  }
  &.chain-info {
    gap: 4px;
  }
  &.copyable {
    flex-direction: row-reverse;
  }
`;

const Icon = styled.svg`
  width: 16px;
  height: 16px;
  fill: none;
  ${smallScreenStyle(css``)}
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
        {fields.map((section, index) => (
          <div
            className={` ${
              section.key === "Chain" ? "tx-mobile-chain" : "tx-info-layout"
            }`}
            key={index}
          >
            <div className="tx-info-titles">
              <InfoText>{section.key}</InfoText>
            </div>
            <div className="tx-info-data">
              {section.key === "Chain" ? (
                <ValueDiv className="chain-info">
                  <Icon as={chainObject?.logo} />
                  <DataText>{section.value}</DataText>
                </ValueDiv>
              ) : (
                <ValueDiv>
                  {section.url ? (
                    <div className="tx-copy-div">
                      <a
                        href={section.url}
                        target="_blank"
                        style={{ textDecoration: "none" }}
                        rel="noreferrer"
                      >
                        <DataText className="tx-info-copyable">
                          {section.value}
                        </DataText>
                      </a>{" "}
                      {section.isCopy && <CopyButton value={section.value!} />}
                    </div>
                  ) : (
                    <div className="tx-copy-div">
                      <DataText>{section.value} </DataText>
                      {section.isCopy && <CopyButton value={section.value!} />}
                    </div>
                  )}
                </ValueDiv>
              )}
            </div>
          </div>
        ))}
      </div>
      <hr className="border" />
    </StyledDiv>
  );
};

export const CopyButton: React.FC<{ value: string }> = ({ value }) => {
  const [_, copyToClipboard] = useCopyToClipboard();
  return (
    <button onClick={() => copyToClipboard(value)}>
      <Icon as={Copy} />
    </button>
  );
};

export default TxCard;

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

  .border {
    margin: 24px 0px;
    border: 1px solid ${({ theme }) => theme.klerosUIComponentsStroke};
    height: 0px;
  }
`;

const InfoDiv = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  ${smallScreenStyle(css`
    gap: 16px;
  `)}
  width: fit-content;
`;

interface IDataContainer {
  section: string;
}

const DataContainer = styled.div<IDataContainer>`
  display: grid;
  grid-row: 2;
  gap: 108px;
  width: fit-content;

  ${(props) =>
    props.section === "Chain"
      ? smallScreenStyle(css`
          display: flex;
          flex-direction: row;
          gap: 16px;
        `)
      : smallScreenStyle(css`
          display: flex;
          flex-direction: column;
          gap: 4px;
        `)}
`;

const InfoText = styled.small`
  grid-column-start: 1;
  display: inline-block;
  width: 12vw;
  gap: 4px;
  ${smallScreenStyle(css`
    width: auto;
  `)}
  color: ${({ theme }) => theme.color.smoke};
`;

interface IDataText {
  url?: string;
}

const DataText = styled.small<IDataText>`
  ${(props) =>
    props.url
      ? css`
          color: ${({ theme }) =>
            theme.klerosUIComponentsPrimaryBlue} !important;
          text-decoration: none;
        `
      : css`
          color: ${({ theme }) => theme.klerosUIComponentsPrimaryText};
        `}
`;

interface IValueDiv {
  section: string;
}

const ValueDiv = styled.div<IValueDiv>`
  display: flex;
  align-items: center;

  ${smallScreenStyle(css`
    width: 100%;
    gap: 4px;
    word-break: break-all;
  `)}

  ${(props) =>
    props.section === "Chain"
      ? css`
          gap: 4px;
        `
      : css`
          gap: 9px;
        `}
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

const DataDiv = styled.div`
  grid-column-start: 2;
  display: flex;
  flex-direction: column;
  width: auto;
  gap: 4px;
`;

const CopyableDiv = styled.div`
  display: flex;
  gap: 9px;
  ${smallScreenStyle(css`
    display: block;
  `)}
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
      <InfoDiv>
        {fields.map((section, index) => (
          <DataContainer section={section.key} key={index}>
            <InfoText>{section.key}</InfoText>
            <DataDiv>
              {section.key === "Chain" ? (
                <ValueDiv section={section.key}>
                  <Icon as={chainObject?.logo} />
                  <DataText>{section.value}</DataText>
                </ValueDiv>
              ) : (
                <ValueDiv section={section.key}>
                  {section.url ? (
                    <CopyableDiv>
                      <a
                        href={section.url}
                        target="_blank"
                        style={{ textDecoration: "none" }}
                        rel="noreferrer"
                      >
                        <DataText url={section.url}>{section.value}</DataText>
                      </a>{" "}
                      {section.isCopy && <CopyButton value={section.value!} />}
                    </CopyableDiv>
                  ) : (
                    <CopyableDiv>
                      <DataText>{section.value} </DataText>
                      {section.isCopy && <CopyButton value={section.value!} />}
                    </CopyableDiv>
                  )}
                </ValueDiv>
              )}
            </DataDiv>
          </DataContainer>
        ))}
      </InfoDiv>
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

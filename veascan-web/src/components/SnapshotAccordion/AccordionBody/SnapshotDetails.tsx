import React from "react";
import TxCard, { TxCardProps } from "./TxCard";

interface ISnapshotDetails {
  transactions: TxCardProps[];
}

const SnapshotDetails: React.FC<ISnapshotDetails> = ({ transactions }) => {
  return (
    <>
      {Object.values(transactions).map(
        (txInfo) => txInfo && <TxCard key={txInfo.title} {...txInfo} />
      )}
    </>
  );
};

export default SnapshotDetails;

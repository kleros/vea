import React from "react";
import TxCard, { ITxCard } from "./TxCard";

interface ISnapshotDetails {
  transactions: ITxCard[];
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

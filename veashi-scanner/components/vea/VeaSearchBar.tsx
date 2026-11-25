import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { SearchForm } from "@/components/SearchForm";
import { findEpochByNumber, findEpochByTxHash } from "@/lib/vea/client";

const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
const EPOCH_REGEX = /^\d{1,15}$/;

/** The epoch search (a number or a transaction hash), with `aside` (the network switch) in the same row, as on Home. */
export default function VeaSearchBar({ aside }: Readonly<{ aside?: ReactNode }>) {
  const navigate = useNavigate();
  return (
    <SearchForm
      label="Epoch number or transaction hash"
      placeholder="An epoch number, or the hash of a snapshot or claim transaction"
      aside={aside}
      validate={(q) =>
        TX_HASH_REGEX.test(q) || EPOCH_REGEX.test(q)
          ? null
          : "Enter an epoch number or a transaction hash (0x followed by 64 hex characters)."
      }
      onSearch={async (q) => {
        const isTxHash = TX_HASH_REGEX.test(q);
        const found = isTxHash ? await findEpochByTxHash(q) : await findEpochByNumber(Number(q));
        if (!found) return isTxHash ? "No epoch found for that transaction hash." : "No epoch found with that number.";
        navigate(`/vea/${found.route.bridgeKey}/${found.route.network}/${found.epoch}`);
        return null;
      }}
    />
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Searchbar, Button } from "@kleros/ui-components-library";
import { findEpochByNumber, findEpochByTxHash } from "@/lib/vea/client";

const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
const EPOCH_REGEX = /^\d{1,15}$/;

export default function VeaSearchBar() {
  const [search, setSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleChange = (value: string) => {
    setSearch(value);
    if (error) setError(null);
  };

  const runSearch = async (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) return;

    const isTxHash = TX_HASH_REGEX.test(trimmed);
    const isEpoch = EPOCH_REGEX.test(trimmed);
    if (!isTxHash && !isEpoch) {
      setError("Enter a transaction hash (0x + 64 hex characters) or an epoch number.");
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const found = isTxHash ? await findEpochByTxHash(trimmed) : await findEpochByNumber(Number(trimmed));
      if (found) {
        navigate(`/vea/${found.route.bridgeKey}/${found.route.network}/${found.epoch}`);
      } else {
        setError(isTxHash ? "No epoch found for that transaction hash." : "No epoch found with that number.");
      }
    } catch (err) {
      console.error("Failed to route to epoch:", err);
      setError("Search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-wrap items-start gap-2 w-full">
      <Searchbar
        value={search}
        onChange={handleChange}
        onSubmit={runSearch}
        isDisabled={isSearching}
        isInvalid={!!error}
        showFieldError={!!error}
        fieldErrorProps={{ children: error ?? undefined }}
        placeholder="Search by epoch number or transaction hash..."
        className="flex-1"
      />

      <Button
        variant="primary"
        text="Search"
        isLoading={isSearching}
        isDisabled={!search.trim() || isSearching}
        onPress={() => runSearch(search)}
      />
    </div>
  );
}

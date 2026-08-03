import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Searchbar, Button } from "@kleros/ui-components-library";
import { findChainForTx } from "@/lib/utils";

const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

export default function SearchBar() {
  const [search, setSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleChange = (value: string) => {
    setSearch(value);
    // Clear error as soon as the user starts editing again
    if (error) setError(null);
  };

  const runSearch = async (rawHash: string) => {
    const trimmedHash = rawHash.trim();
    if (!trimmedHash) return;

    if (!TX_HASH_REGEX.test(trimmedHash)) {
      setError("Invalid transaction hash. Expected 0x followed by 64 hex characters.");
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const foundChainId = await findChainForTx(trimmedHash);
      if (foundChainId) {
        navigate(`/tx/${foundChainId}/${trimmedHash}`);
      } else {
        setError("Transaction not found on any supported chain.");
      }
    } catch (err) {
      console.error("Failed to route to transaction:", err);
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
        placeholder="Search by source transaction hash..."
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

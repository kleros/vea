import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button, Searchbar } from "@kleros/ui-components-library";
import { Inline, Stack } from "@kleros/ui-components-library/kit";

export interface SearchFormProps {
  /** The Searchbar's label. */
  label: string;
  placeholder: string;
  /** Checks the trimmed text before any search: the error to show, or null. */
  validate: (query: string) => string | null;
  /**
   * Runs the search on valid text (navigating when it finds something): the error to show, or null. A throw shows
   * "Search failed. Please try again.".
   */
  onSearch: (query: string) => Promise<string | null>;
  /** Shown in the same row, after the Search button (the network switch). */
  aside?: ReactNode;
  /** Extra classes, merged last. */
  className?: string;
}

/**
 * SearchForm: the hero search of Home and Vea, a `form role="search"` with a core Searchbar, a core Button "Search"
 * and `aside` in one row, and the error under it (linked to the field with `aria-describedby`).
 * Tailwind classes only: library parts, kit layout and klerosUIComponents* tokens (agent/LOOK.md).
 */
export function SearchForm({ label, placeholder, validate, onSearch, aside, className }: Readonly<SearchFormProps>) {
  const errorId = useId();
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const trimmed = query.trim();
    const invalid = validate(trimmed);
    if (invalid) {
      setError(invalid);
      return;
    }
    setIsSearching(true);
    setError(null);
    try {
      setError(await onSearch(trimmed));
    } catch (err) {
      console.error("Search failed:", err);
      setError("Search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <form role="search" onSubmit={submit} className={className}>
      <Stack gap={2}>
        <Inline gap={3} align="end">
          <Searchbar
            label={label}
            placeholder={placeholder}
            value={query}
            onChange={(value) => {
              setQuery(value);
              if (error) setError(null);
            }}
            isDisabled={isSearching}
            isInvalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            className="w-auto min-w-0 grow basis-80"
          />
          <Button type="submit" text="Search" isLoading={isSearching} className="px-6" />
          {aside}
        </Inline>
        {error && (
          <p id={errorId} role="alert" className="text-klerosUIComponentsError text-sm">
            {error}
          </p>
        )}
      </Stack>
    </form>
  );
}

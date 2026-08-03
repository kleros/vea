import type { Network } from "@/lib/types";

interface Props {
  value: Network;
  onChange: (network: Network) => void;
}

const OPTIONS: { value: Network; label: string }[] = [
  { value: "mainnet", label: "Mainnet" },
  { value: "testnet", label: "Testnet" },
];

export default function NetworkToggle({ value, onChange }: Readonly<Props>) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-(--border) bg-(--surface) p-1 shrink-0">
      {OPTIONS.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              isActive ? "bg-purple-700 text-white" : "text-(--text-muted) hover:text-(--text-secondary)"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

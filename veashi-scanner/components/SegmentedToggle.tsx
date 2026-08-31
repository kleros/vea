interface SegmentedToggleOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedToggleProps<T extends string> {
  options: SegmentedToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}

const SIZE_CLASSES = {
  sm: "px-3 py-1 text-xs",
  md: "px-4 py-2 text-sm",
};

export default function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
}: Readonly<SegmentedToggleProps<T>>) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-(--border) bg-(--surface) p-1 shrink-0">
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={`rounded-full font-medium transition-colors ${SIZE_CLASSES[size]} ${
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

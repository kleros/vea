import { useId } from "react";
import { CustomRadio } from "@kleros/ui-components-library";
import { Stack, cn } from "@kleros/ui-components-library/kit";

export interface NetworkSwitchOption<T extends string> {
  value: T;
  label: string;
}

export interface NetworkSwitchProps<T extends string> {
  /** The visible label above the segments, e.g. "Network"; it names the radio group. */
  label: string;
  options: readonly NetworkSwitchOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * One choice out of a few, drawn as design A's segments (the selected one MediumBlue with PrimaryBlue text). It is core
 * `CustomRadio`, so it keeps radio semantics (one choice, arrow keys): CATALOG's segmented-control gap says core Radio
 * for a value, and CustomRadio is that radio group with content of our own. Home and Routes (Mainnet / Testnet) and Vea
 * (Testnet / Devnet) use it.
 */
export function NetworkSwitch<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: Readonly<NetworkSwitchProps<T>>) {
  const labelId = useId();
  return (
    <Stack gap={1} className={className}>
      <span id={labelId} className="text-klerosUIComponentsSecondaryText text-sm">
        {label}
      </span>
      <CustomRadio
        aria-labelledby={labelId}
        orientation="horizontal"
        value={value}
        onChange={(next) => {
          const option = options.find((o) => o.value === next);
          if (option) onChange(option.value);
        }}
        className="bg-klerosUIComponentsWhiteBackground border-klerosUIComponentsStroke rounded-base border p-1"
        items={options.map((option) => ({
          value: option.value,
          content: ({ isSelected, isFocusVisible }) => (
            <span
              className={cn(
                "rounded-base block px-4 py-2 text-sm",
                isSelected
                  ? "bg-klerosUIComponentsMediumBlue text-klerosUIComponentsPrimaryBlue font-semibold"
                  : "bg-klerosUIComponentsWhiteBackground text-klerosUIComponentsPrimaryText font-normal",
                isFocusVisible && "outline-klerosUIComponentsPrimaryBlue outline-2"
              )}
            >
              {option.label}
            </span>
          ),
        }))}
      />
    </Stack>
  );
}

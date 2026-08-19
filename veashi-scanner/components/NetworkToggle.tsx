import SegmentedToggle from "@/components/SegmentedToggle";
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
  return <SegmentedToggle options={OPTIONS} value={value} onChange={onChange} />;
}

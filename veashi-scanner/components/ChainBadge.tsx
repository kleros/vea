import { getChainName } from "@/lib/chains";

// Explicit colors for chains where brand identity matters
const KNOWN_CHAIN_COLORS: Record<number, { bg: string; text: string }> = {
  1: { bg: "rgba(99, 125, 255, 0.15)", text: "#637DFF" }, // Ethereum
  42161: { bg: "rgba(41, 160, 240, 0.15)", text: "#29A0F0" }, // Arbitrum
  10: { bg: "rgba(255, 4, 32, 0.15)", text: "#FF0420" }, // Optimism
  137: { bg: "rgba(130, 71, 229, 0.15)", text: "#8247E5" }, // Polygon
  8453: { bg: "rgba(0, 82, 255, 0.15)", text: "#0052FF" }, // Base
  100: { bg: "rgba(0, 125, 115, 0.15)", text: "#007D73" }, // Gnosis
  43114: { bg: "rgba(232, 65, 66, 0.15)", text: "#E84142" }, // Avalanche
  56: { bg: "rgba(240, 185, 11, 0.15)", text: "#F0B90B" }, // BNB Chain
  250: { bg: "rgba(19, 181, 236, 0.15)", text: "#13B5EC" }, // Fantom
  1313161554: { bg: "rgba(0, 209, 146, 0.15)", text: "#00D192" }, // Aurora
};

// For unknown chains: deterministic HSL color derived from the chain name string.
// Using the name (not the raw ID) keeps the palette visually spread — consecutive
// chain IDs would produce very similar colors if we hashed the integer directly.
function generateColor(chainName: string) {
  let hash = 0;
  for (let i = 0; i < chainName.length; i++) {
    hash = chainName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return {
    bg: `hsla(${hue}, 75%, 60%, 0.15)`,
    text: `hsl(${hue}, 75%, 50%)`,
  };
}

interface ChainBadgeProps {
  chainId: number;
  className?: string;
}

export default function ChainBadge({ chainId, className = "" }: Readonly<ChainBadgeProps>) {
  const name = getChainName(chainId);
  const colors = KNOWN_CHAIN_COLORS[chainId] ?? generateColor(name);

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white whitespace-nowrap ${className}`}
      style={{ backgroundColor: colors.bg }}
    >
      {name}
    </span>
  );
}

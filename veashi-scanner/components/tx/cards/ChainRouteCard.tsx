import type { Message } from "@/lib/types";
import SectionLabel from "../SectionLabel";
import ChainBadge from "@/components/ChainBadge";

export default function ChainRouteCard({ message }: { message: Message }) {
  return (
    <div className="glass rounded-xl border border-(--border) p-5 animate-fade-in" style={{ animationDelay: "0.1s" }}>
      <SectionLabel icon="route" label="Chain Route" />
      <div className="mt-4 flex flex-col gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted) mb-1.5">From</p>
          <ChainBadge chainId={message.sourceChain} className="text-sm" />
        </div>
        <div className="flex items-center gap-1.5 py-0.5">
          <div className="flex-1 h-px bg-(--border)" />
          <div className="w-5 h-5 rounded-full bg-purple-500/15 flex items-center justify-center shrink-0">
            <svg className="w-3 h-3 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>
          <div className="flex-1 h-px bg-(--border)" />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted) mb-1.5">To</p>
          <ChainBadge chainId={message.destinationChain} className="text-sm" />
        </div>
      </div>
    </div>
  );
}

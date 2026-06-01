import { Message } from "@/lib/types";
import SectionLabel from "../SectionLabel";
import CopyButton from "@/components/CopyButton";

export default function AddressesCard({ message }: { message: Message }) {
  return (
    <div className="glass rounded-xl border border-(--border) p-5 animate-fade-in" style={{ animationDelay: "0.15s" }}>
      <SectionLabel icon="address" label="Addresses" />
      <div className="mt-4 space-y-3">
        <AddressRow label="Sender" address={message.sourceAddress} />
        <AddressRow label="Receiver" address={message.destinationAddress} />
      </div>
    </div>
  );
}

function AddressRow({ label, address }: { label: string; address: string }) {
  return (
    <div>
      <p className="text-xs text-(--text-muted) uppercase tracking-wide mb-1">{label}</p>
      <div className="bg-(--surface) rounded-lg px-3 py-2 border border-(--border)">
        <CopyButton text={address} displayText={address} className="text-sm font-mono break-all" />
      </div>
    </div>
  );
}

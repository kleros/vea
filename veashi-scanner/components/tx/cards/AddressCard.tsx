import { Message } from "@/lib/types";
import { Copiable } from "@kleros/ui-components-library";
import SectionCard from "./SectionCard";

export default function AddressesCard({ message }: Readonly<{ message: Message }>) {
  return (
    <SectionCard icon="address" label="Addresses" delay="0.15s">
      <div className="mt-4 space-y-3">
        <AddressRow label="Sender" address={message.sourceAddress} />
        <AddressRow label="Receiver" address={message.destinationAddress} />
      </div>
    </SectionCard>
  );
}

function AddressRow({ label, address }: { label: string; address: string }) {
  return (
    <div>
      <p className="text-xs text-(--text-muted) uppercase tracking-wide mb-1">{label}</p>
      <div className="bg-(--surface) rounded-lg px-3 py-2 border border-(--border)">
        <Copiable copiableContent={address} info="Copy address">
          <span className="font-mono text-sm break-all">{address}</span>
        </Copiable>
      </div>
    </div>
  );
}

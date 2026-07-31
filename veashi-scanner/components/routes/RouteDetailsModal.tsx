import { Modal, Copiable } from "@kleros/ui-components-library";
import type { Bridges } from "@kleros/veashi-sdk";
import { getReporter, getAdapter, getYaho, getSwitch, getYaru, getHashi, getLightbulb } from "@kleros/veashi-sdk";
import { getChainName } from "@/lib/chains";
import { getExplorerAddressUrl } from "@/lib/explorer";
import { getBridgeLabel } from "@/lib/veashiHelpers";
import BridgeBadge from "@/components/BridgeBadge";

interface RouteDetailsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  sourceChainId: number;
  destinationChainId: number;
  bridges: readonly Bridges[];
}

function AddressRow({ label, chainId, address }: Readonly<{ label: string; chainId: number; address?: string }>) {
  if (!address) return null;
  const explorerUrl = getExplorerAddressUrl(chainId, address);

  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3 py-2.5">
      <div className="shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">{label}</p>
        <p className="text-[10px] text-(--text-muted)">{getChainName(chainId)}</p>
      </div>
      <div className="flex items-center justify-end gap-3 min-w-0">
        <Copiable copiableContent={address} info={`Copy ${label} address`}>
          <span className="font-mono text-sm break-all">{address}</span>
        </Copiable>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:text-purple-300 text-xs shrink-0"
          >
            View ↗
          </a>
        )}
      </div>
    </div>
  );
}

export default function RouteDetailsModal({
  isOpen,
  onOpenChange,
  sourceChainId,
  destinationChainId,
  bridges,
}: Readonly<RouteDetailsModalProps>) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      ariaLabel="Route contract details"
      modalOverlayClassname="pt-(--header-height)"
      className="!h-auto !w-[90vw] max-w-2xl max-h-[80vh] overflow-y-auto p-6 my-2"
    >
      <h3 className="text-lg font-bold mb-4">
        {getChainName(sourceChainId)} → {getChainName(destinationChainId)}
      </h3>

      <section className="mb-5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-(--text-muted) mb-2">Core Contracts</h4>
        <div className="divide-y divide-(--border)">
          <AddressRow label="Yaho" chainId={sourceChainId} address={getYaho(sourceChainId, destinationChainId)} />
          <AddressRow label="Switch" chainId={sourceChainId} address={getSwitch(sourceChainId, destinationChainId)} />
          <AddressRow label="Yaru" chainId={destinationChainId} address={getYaru(sourceChainId, destinationChainId)} />
          <AddressRow
            label="Hashi"
            chainId={destinationChainId}
            address={getHashi(sourceChainId, destinationChainId)}
          />
          <AddressRow
            label="Lightbulb"
            chainId={destinationChainId}
            address={getLightbulb(sourceChainId, destinationChainId)}
          />
        </div>
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-(--text-muted) mb-2">Bridges</h4>
        {bridges.length === 0 ? (
          <p className="text-xs text-(--text-muted)">No bridges configured for this route.</p>
        ) : (
          <div className="space-y-4">
            {bridges.map((bridge) => (
              <div key={bridge}>
                <BridgeBadge bridge={getBridgeLabel(bridge)} className="mb-1.5" />
                <div className="divide-y divide-(--border)">
                  <AddressRow
                    label="Reporter"
                    chainId={sourceChainId}
                    address={getReporter(sourceChainId, destinationChainId, bridge)}
                  />
                  <AddressRow
                    label="Adapter"
                    chainId={destinationChainId}
                    address={getAdapter(sourceChainId, destinationChainId, bridge)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </Modal>
  );
}

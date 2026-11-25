import { Button, Modal } from "@kleros/ui-components-library";
import { Inline, KeyValueList, Stack, type KeyValueItem } from "@kleros/ui-components-library/kit";
import type { Bridges } from "@kleros/veashi-sdk";
import { getReporter, getAdapter, getYaho, getSwitch, getYaru, getHashi, getLightbulb } from "@kleros/veashi-sdk";
import { HexValue } from "@/components/HexValue";
import { getChainName } from "@/lib/chains";
import { getExplorerAddressUrl, getExplorerName } from "@/lib/explorer";
import { getBridgeLabel } from "@/lib/veashiHelpers";

interface RouteDetailsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  sourceChainId: number;
  destinationChainId: number;
  bridges: readonly Bridges[];
}

/** One contract row: the full address with copy and explorer actions, and its chain in quiet text. No address, no row. */
function contractRow(id: string, label: string, chainId: number, address: string | undefined): KeyValueItem[] {
  if (!address) return [];
  return [
    {
      id,
      label,
      value: (
        <HexValue
          value={address}
          copyLabel={`Copy the ${label} address`}
          href={getExplorerAddressUrl(chainId, address)}
          explorerLabel={`View the ${label} on ${getExplorerName(chainId)}`}
          className="@sm:justify-end"
        />
      ),
      hint: `on ${getChainName(chainId)}`,
    },
  ];
}

/** A route's core contracts and each bridge's reporter and adapter, in a core Modal (fluid, up to 640 px wide). */
export default function RouteDetailsModal({
  isOpen,
  onOpenChange,
  sourceChainId,
  destinationChainId,
  bridges,
}: Readonly<RouteDetailsModalProps>) {
  const src = sourceChainId;
  const dst = destinationChainId;
  const title = `${getChainName(src)} → ${getChainName(dst)}`;

  const core = [
    ...contractRow("yaho", "Yaho", src, getYaho(src, dst)),
    ...contractRow("switch", "Switch", src, getSwitch(src, dst)),
    ...contractRow("yaru", "Yaru", dst, getYaru(src, dst)),
    ...contractRow("hashi", "Hashi", dst, getHashi(src, dst)),
    ...contractRow("lightbulb", "Lightbulb", dst, getLightbulb(src, dst)),
  ];
  const bridgeRows = bridges.flatMap((bridge) => [
    ...contractRow(`${bridge}-reporter`, `${getBridgeLabel(bridge)} reporter`, src, getReporter(src, dst, bridge)),
    ...contractRow(`${bridge}-adapter`, `${getBridgeLabel(bridge)} adapter`, dst, getAdapter(src, dst, bridge)),
  ]);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      ariaLabel={`Contracts of the route ${getChainName(src)} to ${getChainName(dst)}`}
      fluid
      className="w-160 p-6"
    >
      <Stack gap={6}>
        <Inline gap={3} justify="between" align="start" className="flex-nowrap">
          <Stack gap={1}>
            <h2 className="text-klerosUIComponentsPrimaryText text-lg font-semibold">{title}</h2>
            <p className="text-klerosUIComponentsSecondaryText text-sm">The contracts this route uses.</p>
          </Stack>
          <Button variant="secondary" small text="Close" onPress={() => onOpenChange(false)} />
        </Inline>

        <Stack gap={2}>
          <h3 className="text-klerosUIComponentsPrimaryText text-sm font-semibold">Core contracts</h3>
          <KeyValueList items={core} />
        </Stack>

        <Stack gap={2}>
          <h3 className="text-klerosUIComponentsPrimaryText text-sm font-semibold">Bridges</h3>
          {bridgeRows.length === 0 ? (
            <p className="text-klerosUIComponentsSecondaryText text-sm">No bridges configured for this route.</p>
          ) : (
            <KeyValueList items={bridgeRows} />
          )}
        </Stack>
      </Stack>
    </Modal>
  );
}

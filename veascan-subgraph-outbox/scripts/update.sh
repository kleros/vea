#!/usr/bin/env bash
set -euo pipefail

#
# scripts/update.sh
#
# Usage:
#   ./scripts/update.sh <hardhatNetwork> <graphNetwork> [contractFileSuffix]
#
#   hardhatNetwork:    either "sepolia"  or  "chiado"
#   graphNetwork:      the same string to write into subgraph.yaml → .network (e.g. "sepolia" or "chiado")
#

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
SUBGRAPH_YAML="$SCRIPT_DIR/../subgraph.yaml"
VEAOUTBOX_TS="$SCRIPT_DIR/../src/VeaOutbox.ts"

hardhatNetwork="${1:?"Usage: $0 <hardhatNetwork> <graphNetwork> [contractFileSuffix]"}"
graphNetwork="${2:?"Usage: $0 <hardhatNetwork> <graphNetwork> [contractFileSuffix]"}"
contractFileSuffix="${3:-}"  

# Back up the original subgraph.yaml
cp "$SUBGRAPH_YAML" "$SUBGRAPH_YAML".bak."$(date +%s)"

count=$(yq '.dataSources | length' "$SUBGRAPH_YAML")

for i in $(seq 0 $((count - 1))); do
  origName="$(yq -r ".dataSources[$i].name" "$SUBGRAPH_YAML")"
  newName="$origName"

  if [[ "$hardhatNetwork" == "sepolia" ]]; then
    if [[ "$origName" == *"ArbToGnosisDevnet"* ]]; then
      newName="${origName/ArbToGnosisDevnet/ArbToEthDevnet}"
    elif [[ "$origName" == *"ArbToGnosisTestnet"* ]]; then
      newName="${origName/ArbToGnosisTestnet/ArbToEthTestnet}"
    fi

    # Patch VeaOutbox.ts: swap Gnosis imports to Eth imports when targeting sepolia
    sed -i "" \
      -e 's|from "../generated/VeaOutboxArbToGnosisDevnet/VeaOutboxArbToGnosisDevnet";|from "../generated/VeaOutboxArbToEthDevnet/VeaOutboxArbToEthDevnet";|' \
      -e 's|from "../generated/VeaOutboxArbToGnosisTestnet/VeaOutboxArbToGnosisTestnet";|from "../generated/VeaOutboxArbToEthTestnet/VeaOutboxArbToEthTestnet";|' \
      "$VEAOUTBOX_TS"


  elif [[ "$hardhatNetwork" == "chiado" ]]; then
    if [[ "$origName" == *"ArbToEthDevnet"* ]]; then
      newName="${origName/ArbToEthDevnet/ArbToGnosisDevnet}"
    elif [[ "$origName" == *"ArbToEthTestnet"* ]]; then
      newName="${origName/ArbToEthTestnet/ArbToGnosisTestnet}"
    fi
  

    # Patch VeaOutbox.ts: swap Eth imports to Gnosis imports when targeting chiado
    sed -i "" \
      -e 's|from "../generated/VeaOutboxArbToEthDevnet/VeaOutboxArbToEthDevnet";|from "../generated/VeaOutboxArbToGnosisDevnet/VeaOutboxArbToGnosisDevnet";|' \
      -e 's|from "../generated/VeaOutboxArbToEthTestnet/VeaOutboxArbToEthTestnet";|from "../generated/VeaOutboxArbToGnosisTestnet/VeaOutboxArbToGnosisTestnet";|' \
      "$VEAOUTBOX_TS"
    fi
  artifact="$SCRIPT_DIR/../../contracts/deployments/$hardhatNetwork/${newName}${contractFileSuffix}.json"

  if [[ ! -f "$artifact" ]]; then
    echo "Artifact not found for dataSource[$i]:"
    exit 1
  fi

  yq -i ".dataSources[$i].name = \"$newName\"" "$SUBGRAPH_YAML"

  yq -i ".dataSources[$i].mapping.abis[0].name = \"$newName\"" "$SUBGRAPH_YAML"

  relative_abi_file="../contracts/deployments/$hardhatNetwork/${newName}${contractFileSuffix}.json"
  yq -i ".dataSources[$i].mapping.abis[0].file = \"$relative_abi_file\"" "$SUBGRAPH_YAML"

  yq -i ".dataSources[$i].source.abi = \"$newName\"" "$SUBGRAPH_YAML"

   if [[ "$graphNetwork" == "chiado" ]]; then               
   yq -i ".dataSources[$i].network = \"gnosis-chiado\"" "$SUBGRAPH_YAML"
    else                                                     
   yq -i ".dataSources[$i].network = \"$graphNetwork\""   "$SUBGRAPH_YAML"
    fi

  address="$(jq -r '.address' "$artifact")"
  yq -i ".dataSources[$i].source.address = \"$address\"" "$SUBGRAPH_YAML"


  blockNumber="$(jq '.receipt.blockNumber' "$artifact")"
  yq -i ".dataSources[$i].source.startBlock = $blockNumber" "$SUBGRAPH_YAML"

done

echo "Done! subgraph.yaml is now pointing at $hardhatNetwork artifacts. Backup saved as subgraph.yaml.bak.<timestamp>."

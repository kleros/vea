#!/usr/bin/env bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

function update() {  # Parameters: file, dataSourceIndex, graphNetwork
    local f="$1"
    local dataSourceIndex="$2"
    local graphNetwork="$3"

    # Compute the contract file path relative to the subgraph.yaml file.
    local contractFile="${f#$SCRIPT_DIR/../}"
    
    # Update the ABI file path in subgraph.yaml using an inline environment variable.
    contractFile="$contractFile" yq -i ".dataSources[$dataSourceIndex].mapping.abis[0].file = env(contractFile)" "$SCRIPT_DIR/../subgraph.yaml"

    # Update the network field using the provided graphNetwork value.
    graphNetwork="$graphNetwork" yq -i ".dataSources[$dataSourceIndex].network = env(graphNetwork)" "$SCRIPT_DIR/../subgraph.yaml"

    # Extract the address and start block from the artifact using jq.
    local address
    address=$(jq '.address' "$f")
    yq -i ".dataSources[$dataSourceIndex].source.address = $address" "$SCRIPT_DIR/../subgraph.yaml"

    local blockNumber
    blockNumber=$(jq '.receipt.blockNumber' "$f")
    yq -i ".dataSources[$dataSourceIndex].source.startBlock = $blockNumber" "$SCRIPT_DIR/../subgraph.yaml"
}

# Parameters:
#   $1: hardhatNetwork (default: sepolia)
#   $2: graphNetwork (default: sepolia)
#   $3: contractFileSuffix (optional; default: empty string)
hardhatNetwork="${1:-sepolia}"
graphNetwork="${2:-sepolia}"
contractFileSuffix="${3:-}"  # default is now an empty string
i=0

# Backup the current subgraph.yaml file.
cp "$SCRIPT_DIR/../subgraph.yaml" "$SCRIPT_DIR/../subgraph.yaml.bak.$(date +%s)"

# Iterate over each data source defined in subgraph.yaml.
for contract in $(yq .dataSources[].name "$SCRIPT_DIR/../subgraph.yaml"); do
    update "$SCRIPT_DIR/../../contracts/deployments/$hardhatNetwork/${contract}${contractFileSuffix}.json" "$i" "$graphNetwork"
    (( i++ ))
done

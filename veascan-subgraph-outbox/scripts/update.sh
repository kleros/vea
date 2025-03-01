#!/usr/bin/env bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

function update() #file #dataSourceIndex #graphNetwork
{
    local f="$1"
    local dataSourceIndex="$2"
    local graphNetwork="$3"

    contractFile=${f#$SCRIPT_DIR/../} yq -i  ".dataSources[$dataSourceIndex].mapping.abis[0].file=env(contractFile)" "$SCRIPT_DIR"/../subgraph.yaml
    graphNetwork=$graphNetwork yq -i  ".dataSources[$dataSourceIndex].network=env(graphNetwork)" "$SCRIPT_DIR"/../subgraph.yaml

    address=$(cat "$f" | jq '.address')
    yq -i  ".dataSources[$dataSourceIndex].source.address=$address" "$SCRIPT_DIR"/../subgraph.yaml
    
    blockNumber="$(cat "$f" | jq '.receipt.blockNumber')"
    yq -i  ".dataSources[$dataSourceIndex].source.startBlock=$blockNumber" "$SCRIPT_DIR"/../subgraph.yaml
}

hardhatNetwork=${1:-sepolia}
graphNetwork=${2:-sepolia}
contractFileSuffix=${3:-ArbToEthDevnet}
i=0

# backup
cp "$SCRIPT_DIR"/../subgraph.yaml "$SCRIPT_DIR"/../subgraph.yaml.bak.$(date +%s)

for contract in $(yq .dataSources[].name "$SCRIPT_DIR"/../subgraph.yaml)
do
    update "$SCRIPT_DIR/../../contracts/deployments/$hardhatNetwork/$contract$contractFileSuffix.json" $i $graphNetwork
    (( ++i ))
done
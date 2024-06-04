#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

function generate() { #deploymentDir #explorerUrl
    deploymentDir=$1
    explorerUrl=$2
    for f in $(ls -1 $deploymentDir/*.json); do
        contractName=$(basename $f .json)
        address=$(cat $f | jq -r .address)
        echo "- [$contractName]($explorerUrl$address)"
    done
}

echo "#### Sepolia"
echo
generate "$SCRIPT_DIR/../deployments/sepolia" "https://sepolia.etherscan.io/address/"
echo
echo "#### Arbitrum Sepolia"
echo
generate "$SCRIPT_DIR/../deployments/arbitrumSepolia" "https://sepolia.arbiscan.io/address/"
echo
echo "#### Chiado"
echo
generate "$SCRIPT_DIR/../deployments/chiado" "https://blockscout.com/gnosis/chiado/address/"
echo

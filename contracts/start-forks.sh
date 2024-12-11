#!/bin/sh

if [ -z "$INFURA_API_KEY" ]; then
  echo "Error: INFURA_API_KEY is not set."
  exit 1
fi

if [ -z "$NETWORK" ]; then
  echo "Error: NETWORK is not set for $PORT."
  exit 1
fi

# Set for 8545: Arbitrum Sepolia fork
echo "Starting Hardhat fork for $NETWORK on port $PORT..."
npx hardhat node --fork https://$NETWORK.infura.io/v3/$INFURA_API_KEY --no-deploy --hostname 0.0.0.0 --port $PORT &

wait

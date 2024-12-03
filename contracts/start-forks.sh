#!/bin/sh

if [ -z "$INFURA_ID" ]; then
  echo "Error: INFURA_ID is not set."
  exit 1
fi

# Set for 8545: Arbitrum Sepolia fork
echo "Starting Hardhat fork for $NETWORK1 on port $PORT1..."
npx hardhat node --fork https://$NETWORK1.infura.io/v3/$INFURA_ID --no-deploy --hostname 0.0.0.0 --port $PORT1 &

# Set for 8546: Sepolia fork
echo "Starting Hardhat fork for $NETWORK2 on port $PORT2..."
npx hardhat node --fork https://$NETWORK2.infura.io/v3/$INFURA_ID --no-deploy --hostname 0.0.0.0 --port $PORT2 &

wait

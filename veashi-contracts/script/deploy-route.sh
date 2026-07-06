#!/usr/bin/env bash
set -euo pipefail

# ----------------------------
# Defaults
# ----------------------------
USE_HASHI=false # for deploying Hashi contracts
USE_LZ=false
USE_VEA=false
USE_CCIP=false
USE_DEBRIDGE=false
USE_AXELAR=false
USE_LIGHTBULB=false

REPORTER_CHAIN=""
ADAPTER_CHAIN=""

# Optional but required for verification
ETHERSCAN_API_KEY="${ETHERSCAN_API_KEY:-}"

# ----------------------------
# Parse args
# ----------------------------
while [[ $# -gt 0 ]]; do
  case $1 in
    --reporter-chain)
      REPORTER_CHAIN="$2"
      shift 2
      ;;
    --adapter-chain)
      ADAPTER_CHAIN="$2"
      shift 2
      ;;
    --hashi)
      USE_HASHI=true
      shift
      ;;
    --lz)
      USE_LZ=true
      shift
      ;;
    --vea)
      USE_VEA=true
      shift
      ;;
    --ccip)
      USE_CCIP=true
      shift
      ;;
    --debridge)
      USE_DEBRIDGE=true
      shift
      ;;
    --axelar)
      USE_AXELAR=true
      shift
      ;;
    --lightbulb)
      USE_LIGHTBULB=true
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# ----------------------------
# Validation
# ----------------------------
if [[ -z "$REPORTER_CHAIN" || -z "$ADAPTER_CHAIN" ]]; then
  echo "❌ reporter-chain and adapter-chain are required"
  exit 1
fi

if ! $USE_LZ && ! $USE_VEA && ! $USE_CCIP && ! $USE_LIGHTBULB && ! $USE_HASHI && ! $USE_DEBRIDGE && ! $USE_AXELAR; then
  echo "❌ At least one bridge flag required (--lz / --vea / --ccip/ --hashi/ --lightbulb/ --debridge/ --axelar)"
  exit 1
fi

echo "🚀 Deploying chain pair"
echo "  Reporter chain: $REPORTER_CHAIN"
echo "  Adapter chain:  $ADAPTER_CHAIN"

# ----------------------------
# HASHI
# ----------------------------
if $USE_HASHI; then
  echo "🔵 Deploying Yaho(Hashi)"
  forge script script/hashi/DeployYaho.s.sol:DeployYaho --via-ir \
    --rpc-url "$REPORTER_CHAIN" \
    --verify \
    --broadcast

  echo "🔵 Deploying Yaru(Hashi)"
  forge script script/hashi/DeployYaru.s.sol:DeployYaru --via-ir \
    --rpc-url "$ADAPTER_CHAIN" \
    --broadcast
fi

# ----------------------------
# Switch - Lightbulb
# ----------------------------
if $USE_LIGHTBULB; then
  echo "🔵 Deploying Switch(Reporter chain)"
  forge script script/lightbulb/DeploySwitch.s.sol:DeploySwitch --via-ir \
    --rpc-url "$REPORTER_CHAIN" \
    --verify \
    --broadcast

  echo "🔵 Deploying Lightbulb(Adapter chain)"
  forge script script/lightbulb/DeployLightbulb.s.sol:DeployLightbulb --via-ir \
    --rpc-url "$ADAPTER_CHAIN" \
    --broadcast
fi

# ----------------------------
# LayerZero
# ----------------------------
if $USE_LZ; then
  echo "🔵 Deploying LayerZero Reporter"
  forge script script/layerZero/DeployLZReporter.s.sol:DeployLZReporter \
    --rpc-url "$REPORTER_CHAIN" \
    --verify \
    --broadcast

  echo "🔵 Deploying LayerZero Adapter"
  forge script script/layerZero/DeployLZAdapter.s.sol:DeployLZAdapter \
    --rpc-url "$ADAPTER_CHAIN" \
    --broadcast

  echo "🔵 Configuring LayerZero Reporter"
  forge script script/layerZero/ConfigureLZReporter.s.sol:ConfigureLZReporter --via-ir \
    --rpc-url "$REPORTER_CHAIN" \
    --broadcast
fi

# ----------------------------
# VEA
# ----------------------------
if $USE_VEA; then
  echo "🔵 Deploying Vea Adapter"
  forge script script/vea/DeployVeaAdapter.s.sol:DeployVeaAdapter \
    --rpc-url "$ADAPTER_CHAIN" \
    --broadcast

  echo "🔵 Deploying Vea Reporter"
  forge script script/vea/DeployVeaReporter.s.sol:DeployVeaReporter \
    --rpc-url "$REPORTER_CHAIN" \
    --verify \
    --broadcast

  echo "🔵 Configuring LayerZero Reporter"
  forge script script/vea/DeployVeaAdapter.s.sol:SetupVeaAdapter \
    --rpc-url "$REPORTER_CHAIN" \
    --broadcast
fi

# ----------------------------
# CCIP
# ----------------------------
if $USE_CCIP; then
  echo "🔵 Deploying CCIP Reporter"
  forge script script/ccip/DeployCCIPReporter.s.sol:DeployCCIPReporter \
    --rpc-url "$REPORTER_CHAIN" \
    --verify \
    --broadcast

  echo "🔵 Deploying CCIP Adapter"
  forge script script/ccip/DeployCCIPAdapter.s.sol:DeployCCIPAdapter \
    --rpc-url "$ADAPTER_CHAIN" \
    --broadcast
fi

# ----------------------------
# DeBridge
# ----------------------------
if $USE_DEBRIDGE; then
  echo "🔵 Deploying DeBridge Reporter"
  forge script script/deBridge/DeployDeBridgeReporter.s.sol:DeployDeBridgeReporter \
    --rpc-url "$REPORTER_CHAIN" \
    --verify \
    --broadcast

  echo "🔵 Deploying DeBridge Adapter"
  forge script script/deBridge/DeployDeBridgeAdapter.s.sol:DeployDeBridgeAdapter \
    --rpc-url "$ADAPTER_CHAIN" \
    --broadcast
fi

# ----------------------------
# Axelar
# ----------------------------
if $USE_AXELAR; then
  echo "🔵 Deploying Axelar Reporter"
  forge script script/axelar/DeployAxelarReporter.s.sol:DeployAxelarReporter \
    --rpc-url "$REPORTER_CHAIN" \
    --verify \
    --broadcast

  echo "🔵 Deploying Axelar Adapter"
  forge script script/axelar/DeployAxelarAdapter.s.sol:DeployAxelarAdapter \
    --rpc-url "$ADAPTER_CHAIN" \
    --broadcast
fi

echo "✅ Chain pair deployment complete"

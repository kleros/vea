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

# Gas estimate multipliers (percent). Foundry's default is 130.
# forge script derives gas from a LOCAL simulation using standard EVM pricing.
# Chains that reprice execution (e.g. Tempo TIP-1000: 1000 gas/byte deployment,
# 250k per new storage slot) need this raised or every deploy dies out-of-gas at
# exactly the estimated limit. Measured on Tempo: real/estimated = 3.75x.
# Set per side, because a high multiplier raises the gas LIMIT, and the deployer
# must hold enough balance to cover that limit up front.
REPORTER_GAS_MULT=""
ADAPTER_GAS_MULT=""
REPORTER_GAS_FLAG=""
ADAPTER_GAS_FLAG=""

# Chains known to need a raised multiplier, by chain id.
# Tempo (TIP-1000) measured requirement vs Foundry's local estimate:
#   contract deploy        3.75x
#   single-SSTORE setter   ~7.0x   (250k per NEW storage slot, vs 20k standard)
#   setConfig w/ 3 DVNs    ~9.7x   (writes several new slots)
# 1200 covers the worst case with margin. A high limit is nearly free here:
# Tempo gas is ~$6.6e-10/gas, so a 20M limit costs about $0.013.
AUTO_MULT_CHAINS="4217"   # Tempo
AUTO_MULT_VALUE=1200

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
    --reporter-gas-multiplier)
      REPORTER_GAS_MULT="$2"
      shift 2
      ;;
    --adapter-gas-multiplier)
      ADAPTER_GAS_MULT="$2"
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

# ----------------------------
# Gas multiplier resolution
# ----------------------------
# Auto-raise for chains known to reprice execution, unless overridden explicitly.
_auto_mult_for() {
  local rpc="$1" id
  id="$(cast chain-id --rpc-url "$rpc" 2>/dev/null || echo "")"
  for c in $AUTO_MULT_CHAINS; do
    if [[ "$id" == "$c" ]]; then echo "$AUTO_MULT_VALUE"; return; fi
  done
  echo ""
}

if [[ -z "$REPORTER_GAS_MULT" ]]; then
  REPORTER_GAS_MULT="$(_auto_mult_for "$REPORTER_CHAIN")"
  [[ -n "$REPORTER_GAS_MULT" ]] && echo "ℹ️  reporter chain needs repriced gas; using --gas-estimate-multiplier $REPORTER_GAS_MULT"
fi
if [[ -z "$ADAPTER_GAS_MULT" ]]; then
  ADAPTER_GAS_MULT="$(_auto_mult_for "$ADAPTER_CHAIN")"
  [[ -n "$ADAPTER_GAS_MULT" ]] && echo "ℹ️  adapter chain needs repriced gas; using --gas-estimate-multiplier $ADAPTER_GAS_MULT"
fi

for v in "$REPORTER_GAS_MULT" "$ADAPTER_GAS_MULT"; do
  if [[ -n "$v" && ! "$v" =~ ^[0-9]+$ ]]; then
    echo "❌ gas multiplier must be a positive integer (percent), got: $v"; exit 1
  fi
done

[[ -n "$REPORTER_GAS_MULT" ]] && REPORTER_GAS_FLAG="--gas-estimate-multiplier $REPORTER_GAS_MULT"
[[ -n "$ADAPTER_GAS_MULT"  ]] && ADAPTER_GAS_FLAG="--gas-estimate-multiplier $ADAPTER_GAS_MULT"

echo "🚀 Deploying chain pair"
echo "  Reporter chain: $REPORTER_CHAIN"
echo "  Adapter chain:  $ADAPTER_CHAIN"
echo "  Reporter gas multiplier: ${REPORTER_GAS_MULT:-default(130)}"
echo "  Adapter gas multiplier:  ${ADAPTER_GAS_MULT:-default(130)}"

# ----------------------------
# HASHI
# ----------------------------
if $USE_HASHI; then
  echo "🔵 Deploying Yaho(Hashi)"
  forge script script/hashi/DeployYaho.s.sol:DeployYaho --via-ir \
    --rpc-url "$REPORTER_CHAIN" $REPORTER_GAS_FLAG \
    --verify \
    --broadcast

  echo "🔵 Deploying Yaru(Hashi)"
  forge script script/hashi/DeployYaru.s.sol:DeployYaru --via-ir \
    --rpc-url "$ADAPTER_CHAIN" $ADAPTER_GAS_FLAG \
    --broadcast
fi

# ----------------------------
# Switch - Lightbulb
# ----------------------------
if $USE_LIGHTBULB; then
  echo "🔵 Deploying Switch(Reporter chain)"
  forge script script/lightbulb/DeploySwitch.s.sol:DeploySwitch --via-ir \
    --rpc-url "$REPORTER_CHAIN" $REPORTER_GAS_FLAG \
    --verify \
    --broadcast

  echo "🔵 Deploying Lightbulb(Adapter chain)"
  forge script script/lightbulb/DeployLightbulb.s.sol:DeployLightbulb --via-ir \
    --rpc-url "$ADAPTER_CHAIN" $ADAPTER_GAS_FLAG \
    --broadcast
fi

# ----------------------------
# LayerZero
# ----------------------------
if $USE_LZ; then
  echo "🔵 Deploying LayerZero Reporter"
  forge script script/layerZero/DeployLZReporter.s.sol:DeployLZReporter \
    --rpc-url "$REPORTER_CHAIN" $REPORTER_GAS_FLAG \
    --verify \
    --broadcast

  echo "🔵 Deploying LayerZero Adapter"
  forge script script/layerZero/DeployLZAdapter.s.sol:DeployLZAdapter \
    --rpc-url "$ADAPTER_CHAIN" $ADAPTER_GAS_FLAG \
    --broadcast

  echo "🔵 Configuring LayerZero Reporter"
  forge script script/layerZero/ConfigureLZReporter.s.sol:ConfigureLZReporter --via-ir \
    --rpc-url "$REPORTER_CHAIN" $REPORTER_GAS_FLAG \
    --broadcast
fi

# ----------------------------
# VEA
# ----------------------------
if $USE_VEA; then
  echo "🔵 Deploying Vea Adapter"
  forge script script/vea/DeployVeaAdapter.s.sol:DeployVeaAdapter \
    --rpc-url "$ADAPTER_CHAIN" $ADAPTER_GAS_FLAG \
    --broadcast

  echo "🔵 Deploying Vea Reporter"
  forge script script/vea/DeployVeaReporter.s.sol:DeployVeaReporter \
    --rpc-url "$REPORTER_CHAIN" $REPORTER_GAS_FLAG \
    --verify \
    --broadcast

  echo "🔵 Configuring LayerZero Reporter"
  forge script script/vea/DeployVeaAdapter.s.sol:SetupVeaAdapter \
    --rpc-url "$REPORTER_CHAIN" $REPORTER_GAS_FLAG \
    --broadcast
fi

# ----------------------------
# CCIP
# ----------------------------
if $USE_CCIP; then
  echo "🔵 Deploying CCIP Reporter"
  forge script script/ccip/DeployCCIPReporter.s.sol:DeployCCIPReporter \
    --rpc-url "$REPORTER_CHAIN" $REPORTER_GAS_FLAG \
    --verify \
    --broadcast

  echo "🔵 Deploying CCIP Adapter"
  forge script script/ccip/DeployCCIPAdapter.s.sol:DeployCCIPAdapter \
    --rpc-url "$ADAPTER_CHAIN" $ADAPTER_GAS_FLAG \
    --broadcast
fi

# ----------------------------
# DeBridge
# ----------------------------
if $USE_DEBRIDGE; then
  echo "🔵 Deploying DeBridge Reporter"
  forge script script/deBridge/DeployDeBridgeReporter.s.sol:DeployDeBridgeReporter \
    --rpc-url "$REPORTER_CHAIN" $REPORTER_GAS_FLAG \
    --verify \
    --broadcast

  echo "🔵 Deploying DeBridge Adapter"
  forge script script/deBridge/DeployDeBridgeAdapter.s.sol:DeployDeBridgeAdapter \
    --rpc-url "$ADAPTER_CHAIN" $ADAPTER_GAS_FLAG \
    --broadcast
fi

# ----------------------------
# Axelar
# ----------------------------
if $USE_AXELAR; then
  echo "🔵 Deploying Axelar Reporter"
  forge script script/axelar/DeployAxelarReporter.s.sol:DeployAxelarReporter \
    --rpc-url "$REPORTER_CHAIN" $REPORTER_GAS_FLAG \
    --verify \
    --broadcast

  echo "🔵 Deploying Axelar Adapter"
  forge script script/axelar/DeployAxelarAdapter.s.sol:DeployAxelarAdapter \
    --rpc-url "$ADAPTER_CHAIN" $ADAPTER_GAS_FLAG \
    --broadcast
fi

echo "✅ Chain pair deployment complete"

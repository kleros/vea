#!/usr/bin/env bash
set -euo pipefail

# Deploys, wires and hands over one Hashi route: reporters on the reporter chain, adapters on the adapter chain.
# Every step is a forge script; the README lists the same steps as plain forge commands.
#
#   deploy:          --hashi --lz --vea --ccip --debridge --axelar (any of them)
#   --set-dispatcher point every reporter of the route at DISPATCHER_ADDRESS
#   --handover       move every governed contract of the route to GOVERNOR_ADDRESS

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ----------------------------
# Defaults
# ----------------------------
USE_HASHI=false # for deploying Hashi contracts
USE_LZ=false
USE_VEA=false
USE_CCIP=false
USE_DEBRIDGE=false
USE_AXELAR=false

MODE_SET_DISPATCHER=false
MODE_HANDOVER=false
NO_VERIFY=false

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

# Chains known to need a raised multiplier, by chain id.
# Must equal the chains _isRepricedChain() accepts in script/helpers/DestinationGas.sol (today TEMPO_CHAIN_ID = 4217):
# keep both in sync.
# Tempo (TIP-1000) measured requirement vs Foundry's local estimate:
#   contract deploy        3.75x
#   single-SSTORE setter   ~7.0x   (250k per NEW storage slot, vs 20k standard)
#   setConfig w/ 3 DVNs    ~9.7x   (writes several new slots)
# 1200 covers the worst case with margin. A high limit is nearly free here:
# Tempo gas is ~$6.6e-10/gas, so a 20M limit costs about $0.013.
AUTO_MULT_CHAINS="4217" # Tempo
AUTO_MULT_VALUE=1200

# Verification: forge reads ETHERSCAN_API_KEY from the environment (or .env) itself;
# without it, forge verify-contract uses Sourcify.

usage() {
  cat <<'EOF'
Usage: script/deploy-route.sh --reporter-chain <rpc> --adapter-chain <rpc> [options] <bridges | mode>

Bridges (deploy, any of): --hashi --lz --vea --ccip --debridge --axelar
Modes (exactly one, no bridge flags): --set-dispatcher | --handover
Options:
  --reporter-gas-multiplier <percent>   default 130, 1200 on repriced chains (Tempo)
  --adapter-gas-multiplier <percent>
  --no-verify                           skip forge verify-contract (always off on 31337/1337)
REPORTER_CHAIN_ID and ADAPTER_CHAIN_ID come from the shell or .env and must match the RPCs.
EOF
}

# ----------------------------
# Parse args
# ----------------------------
while [[ $# -gt 0 ]]; do
  case $1 in
    --reporter-chain)
      REPORTER_CHAIN="${2:-}"
      shift 2 || { echo "❌ --reporter-chain needs a value"; exit 1; }
      ;;
    --adapter-chain)
      ADAPTER_CHAIN="${2:-}"
      shift 2 || { echo "❌ --adapter-chain needs a value"; exit 1; }
      ;;
    --reporter-gas-multiplier)
      REPORTER_GAS_MULT="${2:-}"
      shift 2 || { echo "❌ --reporter-gas-multiplier needs a value"; exit 1; }
      ;;
    --adapter-gas-multiplier)
      ADAPTER_GAS_MULT="${2:-}"
      shift 2 || { echo "❌ --adapter-gas-multiplier needs a value"; exit 1; }
      ;;
    --hashi) USE_HASHI=true; shift ;;
    --lz) USE_LZ=true; shift ;;
    --vea) USE_VEA=true; shift ;;
    --ccip) USE_CCIP=true; shift ;;
    --debridge) USE_DEBRIDGE=true; shift ;;
    --axelar) USE_AXELAR=true; shift ;;
    --set-dispatcher) MODE_SET_DISPATCHER=true; shift ;;
    --handover) MODE_HANDOVER=true; shift ;;
    --no-verify) NO_VERIFY=true; shift ;;
    --lightbulb)
      echo "❌ --lightbulb was removed: the Switch cannot dispatch through PR #529 reporters (it is not a VouchedDispatcher); script/lightbulb/*.s.sol remain for manual use"
      exit 1
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "❌ Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

# ----------------------------
# Validation (no RPC calls yet)
# ----------------------------
if [[ -z "$REPORTER_CHAIN" || -z "$ADAPTER_CHAIN" ]]; then
  echo "❌ --reporter-chain and --adapter-chain are required"
  exit 1
fi

BRIDGES=()
$USE_HASHI && BRIDGES+=(hashi)
$USE_LZ && BRIDGES+=(lz)
$USE_VEA && BRIDGES+=(vea)
$USE_CCIP && BRIDGES+=(ccip)
$USE_DEBRIDGE && BRIDGES+=(debridge)
$USE_AXELAR && BRIDGES+=(axelar)

MODES=0
$MODE_SET_DISPATCHER && MODES=$((MODES + 1))
$MODE_HANDOVER && MODES=$((MODES + 1))

if ((MODES > 1)); then
  echo "❌ --set-dispatcher and --handover are separate runs: pass one of them"
  exit 1
fi
if ((MODES == 1 && ${#BRIDGES[@]} > 0)); then
  echo "❌ a mode flag (--set-dispatcher / --handover) cannot be combined with bridge flags"
  exit 1
fi
if ((MODES == 0 && ${#BRIDGES[@]} == 0)); then
  echo "❌ pass at least one bridge flag (--hashi / --lz / --vea / --ccip / --debridge / --axelar) or one mode (--set-dispatcher / --handover)"
  exit 1
fi

for v in "$REPORTER_GAS_MULT" "$ADAPTER_GAS_MULT"; do
  if [[ -n "$v" && ! "$v" =~ ^[1-9][0-9]*$ ]]; then
    echo "❌ gas multiplier must be a positive integer (percent), got: $v"
    exit 1
  fi
  if [[ -n "$v" ]] && ((v < 100)); then
    echo "⚠️  gas multiplier $v is below 100: forge will set gas limits under its own estimate"
  fi
done

# ----------------------------
# Preflight
# ----------------------------
for tool in forge cast jq; do
  command -v "$tool" >/dev/null 2>&1 || { echo "❌ $tool not found on PATH"; exit 1; }
done

# The shell env if set, else the single KEY= line of .env (export, quotes, CR and inline comments stripped).
# .env is never sourced. A missing file or key gives an empty string. A key set twice is refused: forge's dotenv
# keeps the first line, a sourced .env keeps the last.
_env_get() {
  local k="$1" n
  if [[ -n "${!k:-}" ]]; then
    printf '%s' "${!k}"
    return 0
  fi
  n="$(grep -cE "^[[:space:]]*(export[[:space:]]+)?${k}=" "$ROOT/.env" 2>/dev/null || true)"
  if ((${n:-0} > 1)); then
    echo "❌ $k is set $n times in .env: keep one line" >&2
    return 1
  fi
  { grep -E "^[[:space:]]*(export[[:space:]]+)?${k}=" "$ROOT/.env" 2>/dev/null || true; } |
    head -n 1 | cut -d= -f2- |
    sed -E 's/\r$//; s/^[[:space:]]+//; s/^#.*$//; s/[[:space:]]+#.*$//; s/[[:space:]]+$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}

REPORTER_CHAIN_ID="$(_env_get REPORTER_CHAIN_ID)" || exit 1
ADAPTER_CHAIN_ID="$(_env_get ADAPTER_CHAIN_ID)" || exit 1
for pair in "REPORTER_CHAIN_ID:$REPORTER_CHAIN_ID" "ADAPTER_CHAIN_ID:$ADAPTER_CHAIN_ID"; do
  key="${pair%%:*}" val="${pair#*:}"
  if [[ -z "$val" ]]; then
    echo "❌ set $key in .env or the shell"
    exit 1
  fi
  if [[ ! "$val" =~ ^[0-9]+$ ]]; then
    echo "❌ $key must be a chain id (digits), got: $val"
    exit 1
  fi
done
# forge loads .env without overriding the environment, so every forge call below uses the ids checked here.
export REPORTER_CHAIN_ID ADAPTER_CHAIN_ID

# The ids are looked up once; a failed lookup is fatal (no RPC, no route).
_chain_id_of() {
  local side="$1" rpc="$2" key="$3" expected="$4" id
  if ! id="$(cast chain-id --rpc-url "$rpc" 2>/dev/null)" || [[ ! "$id" =~ ^[0-9]+$ ]]; then
    echo "❌ cast chain-id failed on the $side RPC ($rpc)" >&2
    return 1
  fi
  if [[ "$id" != "$expected" ]]; then
    echo "❌ the $side RPC is chain $id, but $key says $expected" >&2
    return 1
  fi
  printf '%s' "$id"
}
REPORTER_ID="$(_chain_id_of reporter "$REPORTER_CHAIN" REPORTER_CHAIN_ID "$REPORTER_CHAIN_ID")" || exit 1
ADAPTER_ID="$(_chain_id_of adapter "$ADAPTER_CHAIN" ADAPTER_CHAIN_ID "$ADAPTER_CHAIN_ID")" || exit 1
if [[ "$REPORTER_ID" == "$ADAPTER_ID" ]]; then
  echo "❌ the reporter and adapter chains are both $REPORTER_ID: a route needs two chains"
  exit 1
fi

# Verification per side: off with --no-verify, and on local chains (nothing to verify against).
_verify_on() {
  local side="$1" id="$2"
  if $NO_VERIFY; then
    echo "ℹ️  $side chain: verification off (--no-verify)" >&2
    echo false
  elif [[ "$id" == "31337" || "$id" == "1337" ]]; then
    echo "ℹ️  $side chain: verification off (local chain $id)" >&2
    echo false
  else
    echo true
  fi
}
REPORTER_VERIFY="$(_verify_on reporter "$REPORTER_ID")"
ADAPTER_VERIFY="$(_verify_on adapter "$ADAPTER_ID")"

# The route file the Solidity scripts read and write (DeploymentState._statePath).
ROUTE_FILE="broadcast/${REPORTER_ID}-${ADAPTER_ID}.json"
if [[ -f "$ROUTE_FILE" ]]; then
  if ! version="$(jq -r '.stateVersion // empty' "$ROUTE_FILE" 2>/dev/null)"; then
    echo "❌ $ROUTE_FILE is not valid JSON: repair it or archive it outside broadcast/"
    exit 1
  fi
  if [[ -z "$version" ]]; then
    echo "❌ $ROUTE_FILE has no stateVersion: it is a pre-#529 route file. Archive it outside broadcast/ before"
    echo "   deploying this pair again (--set-dispatcher and --handover do not act on pre-#529 routes)"
    exit 1
  fi
  if [[ "$version" != "2" ]]; then
    echo "❌ $ROUTE_FILE has stateVersion $version; this script expects 2"
    exit 1
  fi
elif ((MODES == 1)); then
  echo "❌ $ROUTE_FILE does not exist: deploy the route first (no contracts to act on)"
  exit 1
fi

# Gas multiplier: auto-raised on chains known to reprice execution, unless set explicitly.
_auto_mult_for() {
  local id="$1" c
  for c in $AUTO_MULT_CHAINS; do
    if [[ "$id" == "$c" ]]; then
      echo "$AUTO_MULT_VALUE"
      return
    fi
  done
}
if [[ -z "$REPORTER_GAS_MULT" ]]; then
  REPORTER_GAS_MULT="$(_auto_mult_for "$REPORTER_ID")"
  [[ -n "$REPORTER_GAS_MULT" ]] && echo "ℹ️  reporter chain needs repriced gas; using --gas-estimate-multiplier $REPORTER_GAS_MULT"
fi
if [[ -z "$ADAPTER_GAS_MULT" ]]; then
  ADAPTER_GAS_MULT="$(_auto_mult_for "$ADAPTER_ID")"
  [[ -n "$ADAPTER_GAS_MULT" ]] && echo "ℹ️  adapter chain needs repriced gas; using --gas-estimate-multiplier $ADAPTER_GAS_MULT"
fi
REPORTER_GAS_FLAG=()
ADAPTER_GAS_FLAG=()
[[ -n "$REPORTER_GAS_MULT" ]] && REPORTER_GAS_FLAG=(--gas-estimate-multiplier "$REPORTER_GAS_MULT")
[[ -n "$ADAPTER_GAS_MULT" ]] && ADAPTER_GAS_FLAG=(--gas-estimate-multiplier "$ADAPTER_GAS_MULT")

echo "🚀 Chain pair ${REPORTER_ID} -> ${ADAPTER_ID} (route file $ROUTE_FILE)"
echo "  Reporter chain: $REPORTER_CHAIN"
echo "  Adapter chain:  $ADAPTER_CHAIN"
echo "  Reporter gas multiplier: ${REPORTER_GAS_MULT:-default(130)}"
echo "  Adapter gas multiplier:  ${ADAPTER_GAS_MULT:-default(130)}"

# ----------------------------
# Helpers
# ----------------------------
_rpc() { if [[ "$1" == reporter ]]; then echo "$REPORTER_CHAIN"; else echo "$ADAPTER_CHAIN"; fi; }
_id() { if [[ "$1" == reporter ]]; then echo "$REPORTER_ID"; else echo "$ADAPTER_ID"; fi; }

# A forge script call that never broadcasts (preflight, simulation, check()). Exits 1 when it fails.
simulate() {
  local side="$1" target="$2" what="$3"
  shift 3
  echo "🔎 $what ($side chain)"
  if ! forge script "$target" --via-ir --rpc-url "$(_rpc "$side")" ${1+"$@"}; then
    echo "❌ $what failed on the $side chain: nothing was broadcast by this call"
    exit 1
  fi
}

# Contracts this run created, as "key address" lines, verified at the end.
NEW_KEYS=()
STEP_BACKUP=""
STEP_HAD_FILE=false
STEP_NAME=""
STEP_RUN_FILE=""
STEP_RUN_SIG=""
INTERRUPTED=false
STEP_FORGE_OK=false
VERIFYING=false

_cleanup_backup() {
  [[ -n "$STEP_BACKUP" ]] && rm -f "$STEP_BACKUP"
  STEP_BACKUP=""
}

# An exit in the middle of a step whose forge did not finish (a signal bash does not trap) restores the route file
# before the backup is removed.
_on_exit() {
  if [[ -n "$STEP_NAME" ]] && ! $STEP_FORGE_OK; then _restore_route_file; fi
  _cleanup_backup
}
trap _on_exit EXIT

# A file's checksum, or "none" when it does not exist: tells whether forge rewrote run-latest.json during a step.
_file_sig() { if [[ -f "$1" ]]; then cksum <"$1"; else echo none; fi; }
_run_file_written() { [[ "$(_file_sig "$STEP_RUN_FILE")" != "$STEP_RUN_SIG" ]]; }
# A count jq reads from the step's run-latest.json, 0 when it cannot be read.
_run_count() {
  local n
  n="$(jq "$1" "$STEP_RUN_FILE" 2>/dev/null)" || n=0
  if [[ "$n" =~ ^[0-9]+$ ]]; then printf '%s' "$n"; else printf 0; fi
}

# Puts the route file back as it was before the failed step (or removes it if the step created it).
_restore_route_file() {
  [[ -n "$STEP_NAME" ]] || return 0
  if $STEP_HAD_FILE; then
    cp "$STEP_BACKUP" "$ROUTE_FILE"
  else
    rm -f "$ROUTE_FILE"
  fi
}

_step_failed() {
  local side="$1" target="$2" total=0 sent=0 mined=0 created=0
  _restore_route_file
  if $INTERRUPTED; then
    echo "❌ interrupted during $target on the $side chain (forge exited with an error)"
  else
    echo "❌ step failed: $target on the $side chain"
  fi
  # forge writes run-latest.json with every planned transaction before it sends one: a hash means sent.
  if _run_file_written; then
    total="$(_run_count '.transactions | length')"
    sent="$(_run_count '[.transactions[] | select(.hash != null)] | length')"
    mined="$(_run_count '.receipts | length')"
    created="$(_run_count '[.transactions[] | select(.hash != null and ((.transactionType // "") | startswith("CREATE")))] | length')"
  fi
  echo "   $ROUTE_FILE restored to its state before this step."
  if ((sent == 0)); then
    echo "   Nothing was sent by this step: fix the error above, then continue from this step (README, Recovery)."
  else
    echo "   $sent of $total transactions were sent and $mined mined; restoring the route file does not undo them."
    if ((mined > 0)); then
      echo "   $STEP_RUN_FILE: .receipts lists the mined transactions (a .transactions entry with hash null was never sent):"
      jq -r '.receipts[]? | "     \(.status) \(.transactionHash) " + (if .contractAddress
          then "created \(.contractAddress)" else "to \(.to // "-")" end)' "$STEP_RUN_FILE" 2>/dev/null || true
    else
      echo "   None mined yet ($STEP_RUN_FILE)."
    fi
    if ((sent > mined)); then
      echo "   Sent without a receipt yet; these can still be mined:"
      jq -r '[.receipts[]?.transactionHash] as $m | .transactions[]
        | select(.hash != null) | select(.hash as $h | $m | index($h) | not)
        | "     pending \(.hash) \(.transactionType) " + (if .transactionType == "CALL"
            then (if (.transaction.input // .transaction.data // "0x") == "0x"
              then "value transfer \(.transaction.value // "?") wei (hex)"
              else (.function // "call \((.transaction.input // .transaction.data // "")[0:10])") end)
              + " to \(.contractAddress // "-")"
            else "\(.contractAddress // "-")" end)' "$STEP_RUN_FILE" 2>/dev/null || true
      echo "   Before rerunning this step, check each with cast tx <hash> blockNumber --rpc-url <the $side chain RPC>:"
      echo "   empty means still pending, a block number means mined, 'not found' means dropped."
    fi
    if ((created > 0)); then
      echo "   A contract mined here is not in the route file. Finish the remaining steps with forge script (README)."
      echo "   Do not add --resume as forge suggests: it re-runs the script at a later nonce and records wrong addresses in $ROUTE_FILE (README, Recovery)."
    else
      echo "   This step deploys no contract: once its pending transactions are settled, rerun it."
    fi
  fi
  STEP_NAME=""
  print_unverified
  if $INTERRUPTED; then exit 130; fi
  exit 1
}

# INT, TERM and HUP: a closed terminal or a dropped SSH session counts as an interruption. Bash runs this only after
# the foreground forge has exited. During a step it only notes the signal: run_step then restores the route file if
# forge failed, or keeps it if forge finished the step.
_on_signal() {
  INTERRUPTED=true
  if [[ -n "$STEP_NAME" ]]; then
    return 0
  fi
  if $VERIFYING; then
    echo "❌ interrupted during verification: the route is deployed; verify the rest with forge verify-contract"
  else
    echo "❌ interrupted"
    print_unverified
  fi
  exit 130
}
trap _on_signal INT TERM HUP

# Adds to NEW_KEYS each key this step added or changed whose address the step created (CREATE in run-latest.json).
# A key that records an existing contract (YAHO_ADDRESS, YARU_ADDRESS reuse) is not ours to verify.
_record_created() {
  [[ -f "$ROUTE_FILE" ]] || return 0
  _run_file_written || return 0
  local created line addr
  created="$(jq -r '.transactions[]? | ((select(.transactionType == "CREATE" or .transactionType == "CREATE2")
      | .contractAddress), (.additionalContracts[]?.address)) | select(. != null) | ascii_downcase' \
    "$STEP_RUN_FILE" 2>/dev/null || true)"
  [[ -n "$created" ]] || return 0
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    addr="$(printf '%s' "${line#* }" | tr '[:upper:]' '[:lower:]')"
    if grep -qxF -- "$addr" <<<"$created"; then
      NEW_KEYS+=("$line")
    fi
  done < <(jq -r --slurpfile o "$STEP_BACKUP" \
    'to_entries[] | select(.key != "stateVersion") | select($o[0][.key] != .value) | "\(.key) \(.value)"' \
    "$ROUTE_FILE")
}

# Broadcasts one step. The script body writes the route file before forge sends its transactions, so a failed step
# restores the file from a backup kept outside broadcast/.
run_step() {
  local side="$1" target="$2" gas=() rc=0
  # The ${a[@]+...} form keeps an empty array safe under set -u on bash 3.2 (macOS).
  if [[ "$side" == reporter ]]; then
    gas=(${REPORTER_GAS_FLAG[@]+"${REPORTER_GAS_FLAG[@]}"})
  else
    gas=(${ADAPTER_GAS_FLAG[@]+"${ADAPTER_GAS_FLAG[@]}"})
  fi

  STEP_BACKUP="$(mktemp "${TMPDIR:-/tmp}/deploy-route.XXXXXX")"
  if [[ -f "$ROUTE_FILE" ]]; then
    STEP_HAD_FILE=true
    cp "$ROUTE_FILE" "$STEP_BACKUP"
  else
    STEP_HAD_FILE=false
    echo '{}' >"$STEP_BACKUP"
  fi
  STEP_RUN_FILE="broadcast/$(basename "${target%%:*}")/$(_id "$side")/run-latest.json"
  STEP_RUN_SIG="$(_file_sig "$STEP_RUN_FILE")"
  STEP_NAME="$target"
  STEP_FORGE_OK=false
  if $INTERRUPTED; then
    STEP_NAME=""
    echo "❌ interrupted before $target started"
    print_unverified
    exit 130
  fi

  forge script "$target" --via-ir --rpc-url "$(_rpc "$side")" ${gas[@]+"${gas[@]}"} --broadcast --slow || rc=$?
  if ((rc != 0)); then
    _step_failed "$side" "$target"
  fi
  STEP_FORGE_OK=true

  _record_created
  STEP_NAME=""
  _cleanup_backup
  if $INTERRUPTED; then
    echo "❌ interrupted after $target completed on the $side chain: $ROUTE_FILE keeps its result"
    echo "   Finish the remaining steps with forge script (README)."
    print_unverified
    exit 130
  fi
}
# The chain a state key lives on, and the source of its contract.
_side_for_key() {
  case "$1" in
    yaho | *Reporter) echo reporter ;;
    hashi | yaru | *Adapter) echo adapter ;;
    *) echo "" ;;
  esac
}
_contract_for_key() {
  case "$1" in
    yaho) echo lib/hashi/packages/evm/contracts/Yaho.sol:Yaho ;;
    hashi) echo lib/hashi/packages/evm/contracts/Hashi.sol:Hashi ;;
    yaru) echo lib/hashi/packages/evm/contracts/Yaru.sol:Yaru ;;
    ccipReporter) echo src/adapters/chainlink/CCIPReporter.sol:CCIPReporter ;;
    ccipAdapter) echo src/adapters/chainlink/CCIPAdapter.sol:CCIPAdapter ;;
    deBridgeReporter) echo src/adapters/deBridge/DeBridgeReporter.sol:DeBridgeReporter ;;
    deBridgeAdapter) echo src/adapters/deBridge/DeBridgeAdapter.sol:DeBridgeAdapter ;;
    axelarReporter) echo src/adapters/axelar/AxelarReporter.sol:AxelarReporter ;;
    axelarAdapter) echo src/adapters/axelar/AxelarAdapter.sol:AxelarAdapter ;;
    veaReporter) echo src/adapters/vea/VeaReporter.sol:VeaReporter ;;
    veaAdapter) echo src/adapters/vea/VeaAdapter.sol:VeaAdapter ;;
    lzReporter) echo src/adapters/layerZero/LayerZeroReporter.sol:LayerZeroReporter ;;
    lzAdapter) echo src/adapters/layerZero/LayerZeroAdapter.sol:LayerZeroAdapter ;;
    *) echo "" ;;
  esac
}

# The forge verify-contract command for one "key address" entry, or nothing when its side has verification off.
_verify_cmd() {
  local key="$1" addr="$2" side contract
  side="$(_side_for_key "$key")"
  contract="$(_contract_for_key "$key")"
  [[ -n "$side" && -n "$contract" ]] || return 0
  if [[ "$side" == reporter && "$REPORTER_VERIFY" != true ]] || [[ "$side" == adapter && "$ADAPTER_VERIFY" != true ]]; then
    return 0
  fi
  echo "forge verify-contract $addr $contract --rpc-url $(_rpc "$side") --guess-constructor-args --watch"
}

# When the run stops early: the commands that verify the contracts already created by this run.
print_unverified() {
  local entry cmd cmds=()
  ((${#NEW_KEYS[@]} > 0)) || return 0
  for entry in "${NEW_KEYS[@]}"; do
    cmd="$(_verify_cmd "${entry%% *}" "${entry#* }")"
    [[ -n "$cmd" ]] && cmds+=("$cmd")
  done
  ((${#cmds[@]} > 0)) || return 0
  echo "⚠️  The contracts this run created are not verified yet. Verify them before --handover:"
  printf '     %s\n' "${cmds[@]}"
}

# One forge verify-contract per contract created in this run, on the sides with verification on.
# A failure only warns: the route is deployed either way.
verify_new_contracts() {
  local entry key addr side contract cmd failed=()
  ((${#NEW_KEYS[@]} > 0)) || return 0
  VERIFYING=true
  for entry in "${NEW_KEYS[@]}"; do
    key="${entry%% *}" addr="${entry#* }"
    if [[ -z "$(_contract_for_key "$key")" ]]; then
      echo "⚠️  $key $addr: unknown contract, not verified"
      continue
    fi
    cmd="$(_verify_cmd "$key" "$addr")"
    [[ -n "$cmd" ]] || continue
    side="$(_side_for_key "$key")"
    contract="$(_contract_for_key "$key")"
    echo "🔍 Verifying $key $addr ($contract)"
    if ! forge verify-contract "$addr" "$contract" --rpc-url "$(_rpc "$side")" --guess-constructor-args --watch; then
      echo "⚠️  verification failed for $key $addr"
      failed+=("$cmd")
    fi
  done
  VERIFYING=false
  if ((${#failed[@]} > 0)); then
    echo "⚠️  ${#failed[@]} verification(s) failed. The route is deployed; verify the sources before --handover so the"
    echo "   governor can check them. Rerun:"
    printf '     %s\n' "${failed[@]}"
  fi
}

# Lower case without ${x,,}, which bash 3.2 (macOS) lacks.
_lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# One getter of a Vea contract, empty when the call fails. Only the first word is kept (cast may append " [3.6e3]").
_vea_get() {
  local v
  v="$(cast call --rpc-url "$1" "$2" "$3" 2>/dev/null)" || return 0
  printf '%s' "${v%% *}"
}
_vea_key() {
  local key="$1" val="$2" what="$3"
  if [[ -z "$val" ]]; then
    echo "❌ --vea needs $key (the Vea $what) in .env or the shell"
    exit 1
  fi
  if [[ ! "$val" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    echo "❌ $key must be an address (0x and 40 hex digits), got: $val"
    exit 1
  fi
}

# VEA_INBOX (reporter chain) and VEA_OUTBOX (adapter chain) must be one Vea deployment. The Solidity checks see one
# chain each, so the pair is checked here, where both RPCs are known.
check_vea_pair() {
  local in out in_ep out_ep eo g ir or
  in="$(_env_get VEA_INBOX)" || exit 1
  out="$(_env_get VEA_OUTBOX)" || exit 1
  _vea_key VEA_INBOX "$in" "inbox on the reporter chain"
  _vea_key VEA_OUTBOX "$out" "outbox on the adapter chain"
  echo "🔎 Vea pair: VEA_INBOX $in (reporter chain), VEA_OUTBOX $out (adapter chain)"
  in_ep="$(_vea_get "$REPORTER_CHAIN" "$in" 'epochPeriod()(uint256)')"
  out_ep="$(_vea_get "$ADAPTER_CHAIN" "$out" 'epochPeriod()(uint256)')"
  if [[ -z "$in_ep" ]]; then
    echo "❌ VEA_INBOX $in answers no epochPeriod() on the reporter chain: not a Vea inbox (or the RPC call failed)"
    exit 1
  fi
  if [[ -z "$out_ep" ]]; then
    echo "❌ VEA_OUTBOX $out answers no epochPeriod() on the adapter chain: not a Vea outbox (or the RPC call failed)"
    exit 1
  fi
  if [[ "$in_ep" != "$out_ep" ]]; then
    echo "❌ VEA_INBOX $in and VEA_OUTBOX $out are not one Vea route: epochPeriod $in_ep on the inbox, $out_ep on the outbox"
    exit 1
  fi
  # An ArbToEth inbox names its own outbox.
  eo="$(_vea_get "$REPORTER_CHAIN" "$in" 'veaOutboxArbToEth()(address)')"
  if [[ -n "$eo" && "$(_lower "$eo")" != "$(_lower "$out")" ]]; then
    echo "❌ VEA_INBOX $in is an ArbToEth inbox for outbox $eo, not VEA_OUTBOX $out"
    exit 1
  fi
  # Gnosis routes: both sides name the same router, or the inbox names the outbox (Vea's devnet ArbToGnosis pair).
  for g in routerArbToGnosis routerGnosisToArb; do
    ir="$(_vea_get "$REPORTER_CHAIN" "$in" "$g()(address)")"
    or="$(_vea_get "$ADAPTER_CHAIN" "$out" "$g()(address)")"
    [[ -z "$ir" && -z "$or" ]] && continue
    if [[ -z "$ir" || -z "$or" ]]; then
      echo "❌ VEA_INBOX $in and VEA_OUTBOX $out are not one Vea route: $g() is '$ir' on the inbox, '$or' on the outbox"
      exit 1
    fi
    if [[ "$(_lower "$ir")" != "$(_lower "$or")" && "$(_lower "$ir")" != "$(_lower "$out")" ]]; then
      echo "❌ VEA_INBOX $in and VEA_OUTBOX $out are not one Vea route: $g() is $ir on the inbox, $or on the outbox"
      exit 1
    fi
  done
  echo "   Vea pair OK: epochPeriod $in_ep on both"
  # forge loads .env without overriding the environment, so the steps below use the pair checked here.
  export VEA_INBOX="$in" VEA_OUTBOX="$out"
}

# ----------------------------
# --set-dispatcher
# ----------------------------
if $MODE_SET_DISPATCHER; then
  echo "🔵 Setting the dispatcher on the route's reporters"
  run_step reporter script/route/SetDispatcher.s.sol:SetDispatcher
  simulate reporter script/route/SetDispatcher.s.sol:SetDispatcher "SetDispatcher check()" --sig "check()"
  echo "✅ Dispatcher set and checked"
  exit 0
fi

# ----------------------------
# --handover
# ----------------------------
if $MODE_HANDOVER; then
  # Both chains report before the run stops.
  SIM_FAILED=false
  (simulate reporter script/route/HandOver.s.sol:HandOver "HandOver simulation") || SIM_FAILED=true
  (simulate adapter script/route/HandOver.s.sol:HandOver "HandOver simulation") || SIM_FAILED=true
  if $SIM_FAILED; then
    echo "❌ HandOver refused on at least one chain (both sides reported above): nothing was broadcast"
    exit 1
  fi
  echo "🔵 Handing over the reporter chain"
  run_step reporter script/route/HandOver.s.sol:HandOver
  echo "🔵 Handing over the adapter chain"
  run_step adapter script/route/HandOver.s.sol:HandOver
  simulate reporter script/route/HandOver.s.sol:HandOver "HandOver check()" --sig "check()"
  simulate adapter script/route/HandOver.s.sol:HandOver "HandOver check()" --sig "check()"
  echo "✅ Route handed over and checked on both chains"
  exit 0
fi

# ----------------------------
# Deploy: preflight of every selected bridge on both chains before the first broadcast
# ----------------------------
if $USE_VEA; then
  check_vea_pair
fi

ROUTE_BRIDGES="$(IFS=,; echo "${BRIDGES[*]}")"
export ROUTE_BRIDGES
# Both chains report before the run stops.
SIM_FAILED=false
(simulate reporter script/route/Preflight.s.sol:Preflight "Preflight ($ROUTE_BRIDGES)" --sig "reporter()") || SIM_FAILED=true
(simulate adapter script/route/Preflight.s.sol:Preflight "Preflight ($ROUTE_BRIDGES)" --sig "adapter()") || SIM_FAILED=true
if $SIM_FAILED; then
  echo "❌ Preflight failed on at least one chain (both sides reported above): nothing was broadcast"
  exit 1
fi

# ----------------------------
# HASHI
# ----------------------------
if $USE_HASHI; then
  echo "🔵 Deploying Yaho(Hashi)"
  run_step reporter script/hashi/DeployYaho.s.sol:DeployYaho

  echo "🔵 Deploying Yaru(Hashi)"
  run_step adapter script/hashi/DeployYaru.s.sol:DeployYaru
fi

# ----------------------------
# LayerZero
# ----------------------------
if $USE_LZ; then
  echo "🔵 Deploying LayerZero Reporter"
  run_step reporter script/layerZero/DeployLZReporter.s.sol:DeployLZReporter

  echo "🔵 Deploying LayerZero Adapter"
  run_step adapter script/layerZero/DeployLZAdapter.s.sol:DeployLZAdapter

  echo "🔵 Configuring LayerZero Reporter"
  run_step reporter script/layerZero/ConfigureLZReporter.s.sol:ConfigureLZReporter
fi

# ----------------------------
# VEA
# ----------------------------
if $USE_VEA; then
  echo "🔵 Deploying Vea Adapter"
  run_step adapter script/vea/DeployVeaAdapter.s.sol:DeployVeaAdapter

  echo "🔵 Deploying Vea Reporter"
  run_step reporter script/vea/DeployVeaReporter.s.sol:DeployVeaReporter

  echo "🔵 Configuring Vea Adapter"
  run_step adapter script/vea/DeployVeaAdapter.s.sol:SetupVeaAdapter
fi

# ----------------------------
# CCIP
# ----------------------------
if $USE_CCIP; then
  echo "🔵 Deploying CCIP Reporter"
  run_step reporter script/ccip/DeployCCIPReporter.s.sol:DeployCCIPReporter

  echo "🔵 Deploying CCIP Adapter"
  run_step adapter script/ccip/DeployCCIPAdapter.s.sol:DeployCCIPAdapter
fi

# ----------------------------
# DeBridge
# ----------------------------
if $USE_DEBRIDGE; then
  echo "🔵 Deploying DeBridge Reporter"
  run_step reporter script/deBridge/DeployDeBridgeReporter.s.sol:DeployDeBridgeReporter

  echo "🔵 Deploying DeBridge Adapter"
  run_step adapter script/deBridge/DeployDeBridgeAdapter.s.sol:DeployDeBridgeAdapter
fi

# ----------------------------
# Axelar
# ----------------------------
if $USE_AXELAR; then
  echo "🔵 Deploying Axelar Reporter"
  run_step reporter script/axelar/DeployAxelarReporter.s.sol:DeployAxelarReporter

  echo "🔵 Deploying Axelar Adapter"
  run_step adapter script/axelar/DeployAxelarAdapter.s.sol:DeployAxelarAdapter
fi

verify_new_contracts

echo "✅ Chain pair deployment complete. Next: deploy the gateway, then --set-dispatcher, then --handover (README)."

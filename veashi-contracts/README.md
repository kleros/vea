## Contracts

**This directory contains the core smart contracts for bridging with Hashi using five bridges: LayerZero, Vea, Chainlink CCIP, deBridge and Axelar. It also includes the deployment scripts that set up, configure and hand over cross-chain routes between networks.**

## Relevant links

[Hashi](https://crosschain-alliance.gitbook.io/hashi/meta/explorer)<br>
[Vea](https://docs.vea.ninja/) <br>
[LayerZero](https://docs.layerzero.network/v2/developers/evm/overview) <br>
[CCIP](https://docs.chain.link/ccip) <br>
[deBridge](https://docs.debridge.finance/) <br>
[Axelar](https://docs.axelar.dev/)

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

## Deploy a route

A route carries Hashi messages from a reporter chain to an adapter chain. On the reporter chain it has Yaho and one reporter per bridge; on the adapter chain it has Hashi, Yaru and one adapter per bridge. A gateway (a contract that inherits `VouchedDispatcher`) dispatches messages through Yaho, and every reporter of the route pays bridge fees only for messages its gateway vouches for.

Every route must keep one invariant: the gateway's Yaho, every reporter's `YAHO()` and Yaru's `YAHO()` are the same contract, and Yaru's `SOURCE_CHAIN_ID()` is `REPORTER_CHAIN_ID`.

### Runbook

1. Copy `.env.example` to `.env` and fill one route. The example is Arbitrum One (42161) -> Story (1514): only the values verified for it are filled, every other key is blank. A blank key counts as unset, and a script that needs it fails and names it. Set each key once: forge keeps the first line of a key set twice, and deploy-route.sh refuses a `.env` that sets a key it reads itself (`REPORTER_CHAIN_ID`, `ADAPTER_CHAIN_ID`, and `VEA_INBOX` / `VEA_OUTBOX` with `--vea`) more than once. A value exported in the shell wins over `.env`. If `broadcast/<REPORTER_CHAIN_ID>-<ADAPTER_CHAIN_ID>.json` exists without `stateVersion` (the example pair 42161-1514 has one), every script refuses the pair: archive that file first, as [Route state](#route-state) describes.

2. Deploy Hashi and the bridges. Pass `--hashi` plus one flag per bridge (`--lz`, `--vea`, `--ccip`, `--debridge`, `--axelar`):

   ```shell
   $ export REPORTER_RPC=https://arb1.arbitrum.io/rpc
   $ export ADAPTER_RPC=https://mainnet.storyrpc.io
   $ ./script/deploy-route.sh --reporter-chain "$REPORTER_RPC" --adapter-chain "$ADAPTER_RPC" --hashi --lz --debridge
   ```

   The script checks that each RPC is the chain `REPORTER_CHAIN_ID` / `ADAPTER_CHAIN_ID` names, runs the [preflight](#preflight) on both chains (the second runs even when the first fails, so one run shows both chains' problems), then deploys and configures each bridge in turn. `--hashi` reuses an existing Yaho and Yaru (`YAHO_ADDRESS` / `YARU_ADDRESS` or the route file) and deploys only what is missing. At the end it runs one `forge verify-contract --guess-constructor-args` per contract deployed in this run; a failed verification only warns and prints the command to rerun.

   Every forge step that sends transactions on Story (1514), here, in step 6 and in [Recovery](#recovery), prints `Warning: EIP-3855 is not supported in one or more of the RPCs used. Unsupported Chain IDs: 1514.` forge takes this from its built-in chain list (it has no Shanghai flag for Story), not from the RPC. Story executes PUSH0 and the Cancun opcodes these contracts use, so ignore the warning there. On any other chain it names, check before going on: `cast call --rpc-url "$ADAPTER_RPC" --create 0x60015f5260205ff3` returns `0x…0001` when PUSH0 works.

   Options:

   - `--reporter-gas-multiplier <percent>` / `--adapter-gas-multiplier <percent>`: forge's gas estimate multiplier per side. Default 130 (forge's), and 1200 on chains that reprice execution (Tempo, 4217), where forge's local estimate is far too low. On Tempo the deployer pays gas in a TIP-20 fee token, not in the native balance, and must hold enough of it for each step's full gas limit (forge prints the estimated amount); without it every step fails with `Insufficient funds for gas * price + value`.
   - `--no-verify`: skip verification. It is always off on local chains (31337, 1337).

3. Deploy the gateway on the reporter chain, outside this repo (for Kleros, the kleros-v2 gateway), with the route's Yaho (`.yaho` in the route file) and the reporter and adapter addresses from the route file.

4. Point every reporter of the route at the gateway. Set `DISPATCHER_ADDRESS` (and `DISPATCHER_YAHO`, see below) in `.env` rather than inline, since step 6 checks the dispatcher again. The run ends with a read-only `check()`:

   ```shell
   $ ./script/deploy-route.sh --reporter-chain "$REPORTER_RPC" --adapter-chain "$ADAPTER_RPC" --set-dispatcher
   ```

   The gateway must answer `isDispatching(0) == false` and dispatch through the route's Yaho: its `yaho()` getter is checked, and a gateway without one needs `DISPATCHER_YAHO` set to the Yaho it uses. `DISPATCHER_YAHO` vouches only for `DISPATCHER_ADDRESS`, so keep both set for step 6 and every later `check()`: without them HandOver cannot prove a getter-less gateway, and refuses reporters that point at different dispatchers. Until a reporter has a dispatcher, every dispatch that lists it reverts `DispatcherNotSet`. A reporter that already has another dispatcher is refused unless `REPLACE_DISPATCHER=true`. A reporter whose governor is no longer the deployer is not changed: the script prints the call its governor has to make, and the closing `check()` fails (the run exits 1) until that call is made. A pre-#529 reporter (no `dispatcher()` or `governor()`) is skipped, and a reporter that accepts another Yaho than the route's stops the run.

5. Check the funding. Each paid reporter's step logs its balance against the quote for one dispatch, with a `WARNING` when the balance cannot pay one. See [Funding](#funding).

6. Hand the route over to the multisig. Set `GOVERNOR_ADDRESS` in `.env` rather than inline, and `REPORTER_GOVERNOR_ADDRESS` / `ADAPTER_GOVERNOR_ADDRESS` too when the multisig has a different address on each side: every `--handover` rerun and every `check()` works out the target again from them. The run simulates both chains first (both report before the run stops), broadcasts the reporter chain, then the adapter chain, and ends with `check()` on both:

   ```shell
   $ NEW_KEEPER=<keeper> ./script/deploy-route.sh --reporter-chain "$REPORTER_RPC" --adapter-chain "$ADAPTER_RPC" --handover
   ```

   `NEW_KEEPER` is required when `KEEPER_ADDRESS` is empty, as it is in `.env.example`: the keeper is then the deployer, and HandOver refuses any paid reporter (LayerZero, CCIP, deBridge, Axelar) that would keep the deployer as keeper unless `KEEP_DEPLOYER_KEEPER=true`. Drop it when `KEEPER_ADDRESS` already holds the keeper.

   The governor must be a contract on each chain: not the deployer, not an EOA with an EIP-7702 delegation (its 23-byte `0xef0100` code is refused), and not the gateway (`DISPATCHER_ADDRESS`), the route's Yaho or any address in the route file. HandOver checks every contract's configuration first and refuses (naming the field) before it sends anything. Then, for each contract the deployer still governs, it sets the dispatcher if `DISPATCHER_ADDRESS` is set and the reporter has none, sets the keeper (see [Keeper](#keeper)), points the LayerZero reporter's refund address at the keeper, makes the governor the endpoint delegate of each LayerZero contract, and calls `changeGovernor` last. A reporter with no dispatcher while `DISPATCHER_ADDRESS` is unset is refused unless `ALLOW_UNSET_DISPATCHER=true`, which hands it over anyway and prints, for each such reporter, the `setDispatcher` transaction the governor has to send; a reporter whose dispatcher is not `DISPATCHER_ADDRESS` is refused (run `--set-dispatcher` with `REPLACE_DISPATCHER=true` first). A bridge recorded on one side only (a reporter without its adapter, or the reverse) is refused: deploy the missing contract first ([Recovery](#recovery)). A contract the governor already governs is only checked, and each value it lacks is printed as a governor action with its calldata, except a dispatcher HandOver cannot prove (no `yaho()` getter and not `DISPATCHER_ADDRESS`): the summary marks that reporter `UNPROVEN`, and the run and `check()` fail until `DISPATCHER_ADDRESS` and `DISPATCHER_YAHO` name it. A contract governed by any other account (neither the deployer nor the target) stops the run before any transaction on either chain, and `check()` refuses it too. This usually means a wrong `GOVERNOR_ADDRESS` (or `REPORTER_GOVERNOR_ADDRESS` / `ADAPTER_GOVERNOR_ADDRESS`): check the target, or have that account hand the contract to the target first. The summary lists, for each contract, the governor, endpoint delegate (LayerZero), keeper, refund address (LayerZero reporter) and dispatcher read back from the chain. Yaho, Yaru and Hashi have no governor and are not touched.

### Preflight

Before the first transaction, deploy-route.sh simulates `script/route/Preflight.s.sol` on both chains for the selected bridges (it passes them in `ROUTE_BRIDGES`). Both chains always run, and a missing or wrong value on either stops the run before anything is sent. The preflight:

- refuses the selected bridges that already have a reporter or adapter in the route file, listing all of them in one message;
- reads every input of every selected bridge and calls the bridge contracts on each chain: code at each address (an EOA with an EIP-7702 delegation is not a contract), endpoint ids, gate chain ids, lane support, libraries, the LayerZero config file;
- checks each CCIP selector on its own chain: `CCIP_REPORTER_CHAIN_SELECTOR` against the reporter router's on-ramp to the adapter chain, and `CCIP_ADAPTER_CHAIN_SELECTOR` against the adapter router's live off-ramp from the reporter chain. It logs every off-ramp the router lists for that source and takes an `OffRamp` (1.6 or later) that has the source enabled for that router; a lane with only legacy `EVM2EVMOffRamp`s passes with a `WARNING`, and a listed `OffRamp` with the source disabled or bound to another router fails;
- has `LZ_EXECUTOR` quote `lzReceive` gas to `LZ_ADAPTER_EID`, so a DVN or any other contract that is not an executor for that pathway fails, with the send library's default executor named;
- checks each Axelar chain name against `chainName()` of Axelar's InterchainTokenService on its own chain, case included, and only warns (the name goes unchecked) where that contract has no code or its `chainName()` call fails or returns no readable string;
- refuses a Vea ArbToEth inbox whose `veaOutboxArbToEth()` is not `VEA_OUTBOX`;
- checks that `KEEPER_ADDRESS` is not zero (and logs when the keeper is the deployer);
- checks that a set `DISPATCHER_ADDRESS` is a `VouchedDispatcher` on the route's Yaho, and refuses a set `DISPATCHER_ADDRESS` when `--hashi` deploys a new Yaho (no Yaho yet, or `FORCE_NEW_HASHI`; the gateway cannot exist yet);
- when `--hashi` is not passed, requires the route's Yaho (route file or `YAHO_ADDRESS`) and the route's Yaru (route file or `YARU_ADDRESS`), with Yaru's `YAHO()` equal to that Yaho and `SOURCE_CHAIN_ID()` equal to `REPORTER_CHAIN_ID`;
- logs one OK line per bridge and side.

With `--vea`, deploy-route.sh first checks that `VEA_INBOX` and `VEA_OUTBOX` are one Vea route, which neither chain can tell on its own: the same `epochPeriod()` on both, an ArbToEth inbox naming `VEA_OUTBOX`, and on Gnosis routes the same `routerArbToGnosis()` / `routerGnosisToArb()` on both sides (or an inbox router equal to the outbox, as on Vea's devnet pair).

To run the preflight by hand (this skips the Vea pair check):

```shell
$ ROUTE_BRIDGES=hashi,lz,debridge forge script script/route/Preflight.s.sol:Preflight --via-ir --rpc-url "$REPORTER_RPC" --sig "reporter()"
$ ROUTE_BRIDGES=hashi,lz,debridge forge script script/route/Preflight.s.sol:Preflight --via-ir --rpc-url "$ADAPTER_RPC" --sig "adapter()"
```

### Route state

Each route has one file, `broadcast/<REPORTER_CHAIN_ID>-<ADAPTER_CHAIN_ID>.json`, with the address of every contract the route deployed or reuses (keys `yaho`, `hashi`, `yaru`, `<bridge>Reporter`, `<bridge>Adapter`). These files are committed and synced to the SDK.

- A simulation (`forge script` without `--broadcast`) never writes the route file.
- Route files written by these scripts carry `"stateVersion": "2"`.
- The route files already in `broadcast/` without `stateVersion` record contracts from before the governor, keeper and dispatcher rework. Every script and every deploy-route.sh mode refuses them. Before deploying such a chain pair again, move its file outside `broadcast/`, for example `mkdir -p legacy-routes && git mv broadcast/42161-1514.json legacy-routes/42161-1514.json`. Not into a folder under `broadcast/`: the SDK sync reads every `<id>-<id>.json` below it.
- To keep the Yaho of an archived route (Yaho is unchanged, and a new Yaho hides the old messages from the scanner), set `YAHO_ADDRESS` to the archived `.yaho`. Its Yaru can be reused the same way with `YARU_ADDRESS`, when its `SOURCE_CHAIN_ID()` is the reporter chain.

### Recovery

deploy-route.sh broadcasts one step at a time (one `forge script ... --broadcast --slow` per step). When a step fails or is interrupted (Ctrl-C, a kill, or a hangup: a closed terminal or a dropped SSH session counts as an interruption):

- The route file is restored to its content before that step. Restoring it does not undo transactions: deploy-route.sh prints how many of the step's transactions were sent and mined, and the receipts. In `broadcast/<Script>.s.sol/<chainId>/run-latest.json`, `.receipts` lists the mined transactions; a `.transactions` entry whose `hash` is null was never sent. A transaction that was sent but has no receipt yet can still be mined after the run stops: the wrapper lists those hashes with their type, so check each with `cast tx <hash> blockNumber` before rerunning the step (empty means still pending, a block number means mined, "not found" means dropped; `cast receipt` waits until the transaction is mined). A mined CREATE is an orphan contract. When the step sent nothing, the wrapper says so instead.
- If the signal reached only deploy-route.sh (a `kill` of its pid, or a hangup when it is the session leader, as with `ssh -t host ./script/deploy-route.sh`) and forge went on to finish the step, the route file keeps that step's result and the run stops: finish the remaining steps with the commands below.
- A contract the failed step mined is not in the route file. Rerunning the step deploys a new one and leaves the mined one unused.
- A reporter mined by a failed CCIP, deBridge or Axelar step may already hold its funding: the funding transfer is the step's last transaction, listed in run-latest.json. The route file does not record that reporter, so the handover never moves it and the deployer stays its governor. Withdraw its balance to the keeper: `cast send <orphan> "withdrawNative(uint256)" $(cast balance <orphan> --rpc-url "$REPORTER_RPC") --rpc-url "$REPORTER_RPC" --private-key <deployer or keeper key>` (or `--account <keystore>` / `--ledger` in place of `--private-key`; cast does not read `DEPLOYER_KEY`).
- Never finish a step with `forge script --resume`, with or without `--broadcast`, even when forge suggests it after a dropped transaction. forge re-runs the script body at the deployer's current nonce, so the route file gets addresses no contract occupies: with `--broadcast` it writes them, and a bare `--resume` writes nothing and prints no script output, so nothing warns that the key is missing. Rerun the step instead. If you did resume, put back your copy of the route file from before the resume and add the key by hand from the CREATE's `contractAddress` in `broadcast/<Script>.s.sol/<chainId>/run-latest.json`, then check it with `cast code`.
- A deploy step refuses when its contract is already in the route file, and the preflight refuses the selected bridges that have a reporter or adapter in the route file, listing all of them in one message (`--hashi` is not refused: it reuses what is recorded). So rerun deploy-route.sh only with the bridges that have no contract recorded yet, and finish a half-deployed bridge with the commands below, from the step that failed.
- Finish a failed Hashi step with its command below or a rerun that includes `--hashi`, never a bridge-only rerun: without `--hashi` the preflight refuses a route that has no Yaru serving its Yaho. After a failed `FORCE_NEW_HASHI` run (the new Yaho is recorded, the Yaru step failed), export `FORCE_NEW_HASHI=true` again for that rerun, or run the DeployYaru command of [Replacing Yaho and Yaru](#replacing-yaho-and-yaru-force_new_hashi): a plain rerun refuses the old Yaru.

The per-step commands are the ones deploy-route.sh runs. They read the same `.env`. Run them in this order within a bridge. On a repriced chain (Tempo, 4217) add `--gas-estimate-multiplier 1200`. Drop `--broadcast` to simulate a step first.

A step run by hand has no backup and restore: the script writes the route file before forge sends its transactions. Copy the route file before each step and put the copy back if forge fails (and never add `--resume`, see above).

```shell
$ cp broadcast/42161-1514.json /tmp/42161-1514.json.bak
```

Hashi:

```shell
$ forge script script/hashi/DeployYaho.s.sol:DeployYaho --via-ir --rpc-url "$REPORTER_RPC" --broadcast --slow
$ forge script script/hashi/DeployYaru.s.sol:DeployYaru --via-ir --rpc-url "$ADAPTER_RPC" --broadcast --slow
```

LayerZero (ConfigureLZReporter only sends the calls whose value differs, so it can be rerun):

```shell
$ forge script script/layerZero/DeployLZReporter.s.sol:DeployLZReporter --via-ir --rpc-url "$REPORTER_RPC" --broadcast --slow
$ forge script script/layerZero/DeployLZAdapter.s.sol:DeployLZAdapter --via-ir --rpc-url "$ADAPTER_RPC" --broadcast --slow
$ forge script script/layerZero/ConfigureLZReporter.s.sol:ConfigureLZReporter --via-ir --rpc-url "$REPORTER_RPC" --broadcast --slow
```

Vea (the adapter comes first; SetupVeaAdapter skips when it is already set):

```shell
$ forge script script/vea/DeployVeaAdapter.s.sol:DeployVeaAdapter --via-ir --rpc-url "$ADAPTER_RPC" --broadcast --slow
$ forge script script/vea/DeployVeaReporter.s.sol:DeployVeaReporter --via-ir --rpc-url "$REPORTER_RPC" --broadcast --slow
$ forge script script/vea/DeployVeaAdapter.s.sol:SetupVeaAdapter --via-ir --rpc-url "$ADAPTER_RPC" --broadcast --slow
```

CCIP:

```shell
$ forge script script/ccip/DeployCCIPReporter.s.sol:DeployCCIPReporter --via-ir --rpc-url "$REPORTER_RPC" --broadcast --slow
$ forge script script/ccip/DeployCCIPAdapter.s.sol:DeployCCIPAdapter --via-ir --rpc-url "$ADAPTER_RPC" --broadcast --slow
```

deBridge:

```shell
$ forge script script/deBridge/DeployDeBridgeReporter.s.sol:DeployDeBridgeReporter --via-ir --rpc-url "$REPORTER_RPC" --broadcast --slow
$ forge script script/deBridge/DeployDeBridgeAdapter.s.sol:DeployDeBridgeAdapter --via-ir --rpc-url "$ADAPTER_RPC" --broadcast --slow
```

Axelar:

```shell
$ forge script script/axelar/DeployAxelarReporter.s.sol:DeployAxelarReporter --via-ir --rpc-url "$REPORTER_RPC" --broadcast --slow
$ forge script script/axelar/DeployAxelarAdapter.s.sol:DeployAxelarAdapter --via-ir --rpc-url "$ADAPTER_RPC" --broadcast --slow
```

Dispatcher and handover, with the env of steps 4 and 6. Simulate HandOver on both chains before either broadcast, as deploy-route.sh does, and stop if either fails: the reporter-side run cannot see a refusal on the adapter side. Each `check()` is read-only: a governor signer can run it with `DEPLOYER_ADDRESS` set in place of `DEPLOYER_KEY`. With both set, HandOver and SetDispatcher refuse, before any transaction, a `DEPLOYER_ADDRESS` that is not the address of `DEPLOYER_KEY`. HandOver's `check()` needs the same `GOVERNOR_ADDRESS` / `REPORTER_GOVERNOR_ADDRESS` / `ADAPTER_GOVERNOR_ADDRESS` and `DISPATCHER_ADDRESS` / `DISPATCHER_YAHO` as the handover.

```shell
$ forge script script/route/SetDispatcher.s.sol:SetDispatcher --via-ir --rpc-url "$REPORTER_RPC" --broadcast --slow
$ forge script script/route/SetDispatcher.s.sol:SetDispatcher --via-ir --rpc-url "$REPORTER_RPC" --sig "check()"
$ forge script script/route/HandOver.s.sol:HandOver --via-ir --rpc-url "$REPORTER_RPC"
$ forge script script/route/HandOver.s.sol:HandOver --via-ir --rpc-url "$ADAPTER_RPC"
$ forge script script/route/HandOver.s.sol:HandOver --via-ir --rpc-url "$REPORTER_RPC" --broadcast --slow
$ forge script script/route/HandOver.s.sol:HandOver --via-ir --rpc-url "$ADAPTER_RPC" --broadcast --slow
$ forge script script/route/HandOver.s.sol:HandOver --via-ir --rpc-url "$REPORTER_RPC" --sig "check()"
$ forge script script/route/HandOver.s.sol:HandOver --via-ir --rpc-url "$ADAPTER_RPC" --sig "check()"
```

Verify each contract a hand-run step deployed (the contract paths are in `_contract_for_key` in `script/deploy-route.sh`), for example:

```shell
$ forge verify-contract <address> src/adapters/layerZero/LayerZeroAdapter.sol:LayerZeroAdapter --rpc-url "$ADAPTER_RPC" --guess-constructor-args --watch
```

### Replacing Yaho and Yaru: FORCE_NEW_HASHI

DeployYaho and DeployYaru reuse the route's Yaho and Yaru (`YAHO_ADDRESS` / `YARU_ADDRESS`, or the route file). A reused Yaru must have `YAHO()` equal to the route's Yaho and `SOURCE_CHAIN_ID()` equal to `REPORTER_CHAIN_ID`; otherwise DeployYaru refuses, because that Yaru serves another route.

`FORCE_NEW_HASHI=true` deploys new ones and replaces them in the route file. It is refused while `YAHO_ADDRESS` or `YARU_ADDRESS` is set, and while the route file holds any reporter, adapter, switch or lightbulb: those point at the current Yaho and Yaru, so replacing either would leave a route that mixes two Hashi deployments. Export it for one run only.

To replace only the adapter side, a new Hashi and Yaru (DeployYaru refused the recorded Yaru), keep the route's Yaho in the route file, leave `YAHO_ADDRESS` and `YARU_ADDRESS` empty, and run:

```shell
$ FORCE_NEW_HASHI=true forge script script/hashi/DeployYaru.s.sol:DeployYaru --via-ir --rpc-url "$ADAPTER_RPC" --broadcast --slow
```

`FORCE_NEW_HASHI=true ./script/deploy-route.sh ... --hashi` replaces both.

### LayerZero DVN config

The DVN config does not come from `.env` or the endpoint defaults (on many pathways the default is LayerZero's dead DVN). It comes from `script/config/layerzero.json`, and every LayerZero reporter and adapter gets its own fixed config:

- The send library (`LZ_SEND_LIB`) and receive library (`LZ_RECEIVE_LIB`) are pinned on the reporter and the adapter, so a later change of the endpoint default cannot move them.
- Required DVNs: one per provider named in `requiredDVNs` (today only `layerzero-labs`), at the address the chain's entry lists. No optional DVNs.
- Confirmations: both ends of a pathway use the source chain's `confirmations` from `layerzero.json`. That value is LayerZero's default on a live (not dead-DVN) pathway from that chain, measured as described below. LayerZero sets its defaults per pathway, so another pathway from the same chain can default higher or lower (arbitrum-sepolia to chiado defaults to 1, where `layerzero.json` uses 5). Each step logs the pathway's default next to the value it uses, and prints `WARNING: confirmations are below LayerZero's default for this pathway` only when the value is lower. Expected: routes from Tempo (30410) to Ethereum, Arbitrum, Base or Story print this warning on both the reporter side and the adapter side. Those pathways still carry LayerZero's dead-DVN default of 20 confirmations, while Tempo's 5 is the default on its live pathway (Solana, 30168).
- The scripts read the config back after setting it and fail on any difference.

To add a chain, add an entry under `chains` keyed by its LayerZero eid, with `name`, `chainId`, `confirmations` (read the live default from the chain's SendUln302: `getUlnConfig(<an address without config>, <a remote eid>)`, on a pathway that does not use the dead DVN) and `dvns` with an address for every provider in `requiredDVNs`. Addresses come from https://metadata.layerzero-api.com/v1/metadata. To add a required provider (for example `nethermind`), add its name to `requiredDVNs` once every chain lists an address for it; today every chain lists `nethermind` except Arc testnet (eid 40434), so that entry needs one first, or the config check reverts `provider nethermind missing for eid 40434`. Run `forge test --match-path test/LayerZeroConfig.t.sol` after any change: it checks every chain and every pair of the file.

`layerzero.json` is the policy for every route, including routes already deployed. After an edit to `requiredDVNs` or to a chain's `confirmations`, `HandOver` expects the new config on every existing route that uses the edited value: it refuses to hand over a contract the deployer still governs, and lists the difference as a governor action on a contract the governor already governs. `check()` (also the closing check of `--handover`) fails until the config matches. Apply it one pathway at a time:

- Adding a required DVN or raising confirmations: update the send side first (rerun `ConfigureLZReporter` while the deployer is still the reporter's endpoint delegate, or have the Safe call `endpoint.setConfig` after handover). Wait until every message sent under the old config has been delivered, then update the receive side. No script does the receive side: the adapter's endpoint delegate calls `endpoint.setConfig` on it.
- Removing a DVN or lowering confirmations: do the reverse, receive side first.

The receive side checks each message against its own current config when it commits, so a message never verifies while the receive side requires a DVN the sender did not pay, or more confirmations than the sender asked for.

### Destination gas

LayerZero and CCIP let the reporter choose the gas the message gets on the adapter chain, where the adapter stores each hash in a new storage slot.

- `LZ_GAS_LIMIT` (required with `--lz`): gas units for `lzReceive`, not a fee. It replaces `LZ_DEFAULT_FEE`, which the scripts now refuse. About 200000 is typical.
- `CCIP_GAS_LIMIT` (optional): gas units for `ccipReceive`; empty keeps the contract default of 200000.
- One value covers a whole message whatever its batch size, so size it for the largest batch you dispatch.
- Into Tempo (4217), where a new storage slot costs 250k gas, both must be at least 600000 (`CCIP_GAS_LIMIT` is then required). A lower value is refused unless `ALLOW_LOW_DEST_GAS=true`.
- The keeper can move the gas limit (and the deBridge and Axelar fees) by at most 5% per update and once per hour with the default guardrails, and never off 0; the governor moves it freely.
- A message that ran out of gas can be retried with more gas: `lzReceive` through the LayerZero executor, or CCIP manual execution.

### Funding

A paid reporter (LayerZero, CCIP, deBridge, Axelar) pays every bridge fee from its own balance, and Yaho calls every reporter of a message in one transaction, so one unfunded reporter reverts every dispatch that lists it. Vea charges no fee.

- `<BRIDGE>_REPORTER_FUNDING` is a target balance in wei, not an amount to send: the step tops the reporter up to it, so rerunning ConfigureLZReporter never funds the LayerZero reporter twice. CCIP, deBridge and Axelar fund the reporter inside its deploy step, so a rerun of a failed deploy step funds the new reporter it deploys (see [Recovery](#recovery)). `0` skips funding (with a warning). It is required, so a missing value never leaves a reporter unfunded silently.
- Each step quotes one dispatch first; a reverting quote means the route is misconfigured and stops the step even with funding 0.
- A reporter that pays fees in an ERC20 (a CCIP reporter with `CCIP_FEE_TOKEN`, or a LayerZero reporter on an endpoint with an ERC20 native token, as on Tempo) cannot take native funding: set its funding to 0 and transfer the token by hand, for example `cast send <token> "transfer(address,uint256)" <reporter> <amount> --rpc-url "$REPORTER_RPC" --private-key <key of the account holding the token>` (or `--account <keystore>` / `--ledger` in place of `--private-key`). cast does not read `DEPLOYER_KEY`.
- Later top-ups are plain transfers to the reporter. The keeper or the governor can withdraw the balance, which always goes to the keeper.

### Keeper

Every reporter has a keeper (`KEEPER_ADDRESS`, or the deployer when unset). The keeper receives every withdrawal, can move the reporter's fee and gas limit within the guardrails above, and is the LayerZero reporter's refund address (the endpoint refunds overpaid fees there). A contract keeper must accept native transfers.

At handover the keeper becomes `NEW_KEEPER`, else `KEEPER_ADDRESS`, else stays the current one. The handover refuses to leave the deployer as keeper of a paid reporter unless `KEEP_DEPLOYER_KEEPER=true`, and resets the LayerZero refund address to the keeper. On a contract the governor already governs, `check()` accepts its current keeper (the governor may have changed it) unless `NEW_KEEPER` is set; set `NEW_KEEPER` to assert a specific keeper.

### Lightbulb

The `--lightbulb` flag was removed: the Switch is not a `VouchedDispatcher`, so it cannot dispatch through these reporters, and it must never be `DISPATCHER_ADDRESS`. `script/lightbulb/DeploySwitch.s.sol` and `script/lightbulb/DeployLightbulb.s.sol` remain for manual demos.

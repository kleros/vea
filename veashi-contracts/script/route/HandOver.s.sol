// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console} from "forge-std/console.sol";
import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {OAppCore} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppCore.sol";
import {Governed} from "../../src/governance/Governed.sol";
import {KeeperGoverned} from "../../src/governance/KeeperGoverned.sol";
import {Reporter} from "../../src/adapters/Reporter.sol";
import {CCIPReporter} from "../../src/adapters/chainlink/CCIPReporter.sol";
import {CCIPAdapter} from "../../src/adapters/chainlink/CCIPAdapter.sol";
import {DeBridgeReporter} from "../../src/adapters/deBridge/DeBridgeReporter.sol";
import {DeBridgeAdapter} from "../../src/adapters/deBridge/DeBridgeAdapter.sol";
import {AxelarReporter} from "../../src/adapters/axelar/AxelarReporter.sol";
import {AxelarAdapter} from "../../src/adapters/axelar/AxelarAdapter.sol";
import {LayerZeroReporter} from "../../src/adapters/layerZero/LayerZeroReporter.sol";
import {LayerZeroAdapter} from "../../src/adapters/layerZero/LayerZeroAdapter.sol";
import {VeaReporter} from "../../src/adapters/vea/VeaReporter.sol";
import {VeaAdapter} from "../../src/adapters/vea/VeaAdapter.sol";
import {ILZEndpointViews} from "../helpers/BridgeViews.sol";
import {DispatcherCheck} from "../helpers/DispatcherCheck.sol";
import {VeaInputs} from "../vea/VeaInputs.sol";
import {DeBridgeInputs} from "../deBridge/DeBridgeInputs.sol";
import {AxelarInputs} from "../axelar/AxelarInputs.sol";
import {CCIPInputs, CCIPReporterInputs, CCIPAdapterInputs} from "../ccip/CCIPInputs.sol";
import {LayerZeroConfig} from "../helpers/LayerZeroConfig.sol";
import {LZInputs, LZReporterInputs, LZAdapterInputs} from "../layerZero/LZInputs.sol";

/// @dev `_verifyLz` behind an external call, so HandOver can record a mismatch instead of stopping on it (forge
/// refuses calls from a script to itself). HandOver creates it outside any broadcast; it only reads.
contract HandOverLzVerifier is LayerZeroConfig {
    function verify(
        address endpoint,
        address oapp,
        address lib,
        uint32 eid,
        UlnConfig memory uln,
        bool sendSide,
        address executor,
        uint32 maxMessageSize
    ) external view {
        _verifyLz(endpoint, oapp, lib, eid, uln, sendSide, executor, maxMessageSize);
    }
}

/// @notice Hands every governed contract of the route on this chain to the governor (the Safe): the reporters on
/// the reporter chain, the adapters on the adapter chain. Before the first transaction it checks each contract's
/// route values, dispatcher and keeper, and refuses on any mismatch; it then sets what the deployer still has to
/// set and calls changeGovernor last. It never deploys and never writes the route file. `check()` repeats the
/// checks and the final assertions without a transaction.
contract HandOver is DispatcherCheck, VeaInputs, DeBridgeInputs, AxelarInputs, CCIPInputs, LZInputs {
    enum HandOverStatus {
        MISSING, // not in the route file
        LEGACY, // no governor() (or owner() on LayerZero): not a PR #529 contract
        FOREIGN, // governed by neither the deployer nor the target: refused in phase 1
        ALREADY, // governed by the target
        TODO // governed by the deployer: handed over by this run
    }

    struct HandOverEntry {
        string key;
        /// @dev The same bridge's contract on the other chain (the adapter of a reporter, and back).
        string counterpart;
        address addr;
        HandOverStatus status;
        address governor;
        bool isReporter;
        bool isPaid;
        bool isLz;
        address expectedKeeper;
        /// @dev Zero: the dispatcher stays unset (ALLOW_UNSET_DISPATCHER).
        address expectedDispatcher;
        bool setDispatcher;
        bool setKeeper;
        bool setRefund;
        bool setDelegate;
    }

    address private deployer;
    address private target;
    string private targetKey;
    bool private reporterSide;
    address private yaho;
    address private dispatcherEnv;

    HandOverLzVerifier private lzVerifier;

    HandOverEntry[] private entries;
    /// @dev Mismatches on contracts the deployer still governs, and contracts governed by a third account: the run
    /// refuses before any transaction.
    string private refusals;
    /// @dev Mismatches on contracts the target already governs: governor actions, printed with their calldata.
    string private pending;
    /// @dev Reporters whose dispatcher stays unset, with their addresses.
    string private unset;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        // A DEPLOYER_ADDRESS that is not this key's address reverts here, before any broadcast, not in the closing
        // check().
        _checkDeployer();
        _handOverSetup(vm.addr(pk));
        _handOverPhase1(false);
        _handOverExecute(pk);
        _handOverPhase3(false);
    }

    /// @dev Read only: phase 1 and the final assertions against the chain as it is now. Reverts unless every contract
    /// of this side is governed by the target and holds the expected values. The deployer is DEPLOYER_ADDRESS when
    /// set, so a governor signer needs no key, else the DEPLOYER_KEY address.
    function check() external {
        _handOverSetup(_checkDeployer());
        _handOverPhase1(true);
        _handOverPhase3(true);
    }

    /*//////////////////////////////////////////////////////////////
                                SETUP
    //////////////////////////////////////////////////////////////*/

    function _handOverSetup(address deployer_) private {
        deployer = deployer_;
        require(
            block.chainid == REPORTER_CHAIN_ID || block.chainid == ADAPTER_CHAIN_ID,
            string.concat(
                "chain ",
                vm.toString(block.chainid),
                " is neither REPORTER_CHAIN_ID ",
                vm.toString(REPORTER_CHAIN_ID),
                " nor ADAPTER_CHAIN_ID ",
                vm.toString(ADAPTER_CHAIN_ID)
            )
        );
        reporterSide = block.chainid == REPORTER_CHAIN_ID;
        if (reporterSide) _requireReporterChain();
        else _requireAdapterChain();
        (bool exists, string memory json) = _stateJson();
        require(exists, string.concat(_statePath(), " missing: deploy the route first"));

        targetKey = reporterSide ? "REPORTER_GOVERNOR_ADDRESS" : "ADAPTER_GOVERNOR_ADDRESS";
        if (!_envSet(targetKey)) targetKey = "GOVERNOR_ADDRESS";
        target = _envAddressRequired(targetKey);
        require(target != deployer, string.concat(targetKey, " is the deployer: hand over to the governor (the Safe)"));
        require(
            target.code.length > 0,
            string.concat(
                targetKey,
                " ",
                vm.toString(target),
                " has no code on chain ",
                vm.toString(block.chainid),
                ": the governor must be a contract (the Safe) deployed on this chain"
            )
        );
        require(
            !_is7702(target),
            string.concat(
                targetKey,
                " ",
                vm.toString(target),
                " is an EOA with an EIP-7702 delegation on chain ",
                vm.toString(block.chainid),
                ", not a Safe: the governor must be a contract"
            )
        );

        if (reporterSide) {
            // Never _resolveYaho: this script does not write the route file.
            yaho = _tryResolveYaho();
            require(yaho != address(0), "no Yaho in the route file or YAHO_ADDRESS");
            _requireCode("Yaho", yaho);
        }
        dispatcherEnv = vm.envOr("DISPATCHER_ADDRESS", address(0));
        _handOverRequireNotRoute(json);
        if (reporterSide && dispatcherEnv != address(0)) _checkDispatcher(dispatcherEnv, yaho);

        console.log("HandOver on chain", block.chainid, reporterSide ? "(reporter side)" : "(adapter side)");
        console.log("  route", REPORTER_CHAIN_ID, "->", ADAPTER_CHAIN_ID);
        console.log(string.concat("  target (", targetKey, ")"), target);
        console.log("  deployer", deployer);

        string[5] memory bridges = ["ccip", "deBridge", "axelar", "lz", "vea"];
        for (uint256 i = 0; i < bridges.length; i++) {
            string memory key = string.concat(bridges[i], reporterSide ? "Reporter" : "Adapter");
            address addr = _stateAddressOrZero(string.concat(".", key));
            console.log(string.concat("  ", key), addr);
            entries.push(_handOverClassify(key, addr));
            entries[entries.length - 1].counterpart = string.concat(bridges[i], reporterSide ? "Adapter" : "Reporter");
        }
        // Ungoverned contracts on this chain only: yaho and switch live on the reporter chain; yaru, hashi and
        // lightbulb on the adapter chain.
        string[] memory ungoverned = new string[](reporterSide ? 2 : 3);
        if (reporterSide) {
            ungoverned[0] = "yaho";
            ungoverned[1] = "switch";
        } else {
            ungoverned[0] = "yaru";
            ungoverned[1] = "hashi";
            ungoverned[2] = "lightbulb";
        }
        for (uint256 i = 0; i < ungoverned.length; i++) {
            string memory key = string.concat(".", ungoverned[i]);
            if (vm.keyExistsJson(json, key)) {
                console.log(
                    string.concat("  ", ungoverned[i], " (not governed, skipped)"),
                    vm.parseJsonAddress(json, key)
                );
            }
        }
    }

    /// @dev Refuses a target that is the gateway, the route's Yaho or any contract of the route file, from either chain
    /// (a slip can copy an address from the other side). None of them can call changeGovernor, so every contract
    /// handed to it would be locked for good.
    function _handOverRequireNotRoute(string memory json) private view {
        _handOverRequireNotTarget("DISPATCHER_ADDRESS (the gateway)", dispatcherEnv);
        _handOverRequireNotTarget("the route's Yaho", reporterSide ? yaho : vm.envOr("YAHO_ADDRESS", address(0)));
        string[15] memory keys = [
            "yaho",
            "yaru",
            "hashi",
            "switch",
            "lightbulb",
            "ccipReporter",
            "deBridgeReporter",
            "axelarReporter",
            "lzReporter",
            "veaReporter",
            "ccipAdapter",
            "deBridgeAdapter",
            "axelarAdapter",
            "lzAdapter",
            "veaAdapter"
        ];
        for (uint256 i = 0; i < keys.length; i++) {
            string memory key = string.concat(".", keys[i]);
            if (vm.keyExistsJson(json, key)) {
                _handOverRequireNotTarget(string.concat("the route file's ", keys[i]), vm.parseJsonAddress(json, key));
            }
        }
    }

    function _handOverRequireNotTarget(string memory what, address account) private view {
        require(
            account != target,
            string.concat(targetKey, " ", vm.toString(target), " is ", what, ": hand over to the governor (the Safe)")
        );
    }

    function _handOverClassify(string memory key, address addr) private view returns (HandOverEntry memory e) {
        e.key = key;
        e.addr = addr;
        e.isReporter = reporterSide;
        e.isLz = _handOverIs(key, "lzReporter") || _handOverIs(key, "lzAdapter");
        e.isPaid = reporterSide && !_handOverIs(key, "veaReporter");
        if (addr == address(0)) return e; // MISSING
        _requireCode(string.concat(key, " (route file)"), addr);

        bool ok;
        (ok, e.governor) = _handOverGetAddress(addr, "governor()");
        if (!ok) {
            e.status = HandOverStatus.LEGACY;
            return e;
        }
        if (e.isLz) {
            (bool okOwner, address owner) = _handOverGetAddress(addr, "owner()");
            if (!okOwner) {
                e.status = HandOverStatus.LEGACY;
                return e;
            }
            // GovernedOAppCore moves the owner with the governor; anything else is not a contract of this repo.
            require(
                owner == e.governor,
                string.concat(
                    key,
                    " owner ",
                    vm.toString(owner),
                    " differs from its governor ",
                    vm.toString(e.governor)
                )
            );
        }
        if (e.governor == target) e.status = HandOverStatus.ALREADY;
        else if (e.governor == deployer) e.status = HandOverStatus.TODO;
        else e.status = HandOverStatus.FOREIGN;
    }

    /*//////////////////////////////////////////////////////////////
                    PHASE 1: CHECKS, NO TRANSACTION
    //////////////////////////////////////////////////////////////*/

    function _handOverPhase1(bool checkOnly) private {
        for (uint256 i = 0; i < entries.length; i++) {
            HandOverStatus status = entries[i].status;
            if (status == HandOverStatus.FOREIGN) {
                // Usually a wrong target (another Safe than the one the route was handed to): stop before any
                // contract goes to it.
                refusals = string.concat(
                    refusals,
                    "\n  ",
                    entries[i].key,
                    " is governed by ",
                    vm.toString(entries[i].governor),
                    ", neither the deployer nor ",
                    targetKey,
                    " ",
                    vm.toString(target),
                    ": check the target"
                );
            }
            if (status != HandOverStatus.TODO && status != HandOverStatus.ALREADY) continue;
            if (reporterSide) _handOverReporterValues(i);
            else _handOverAdapterValues(i);
            if (reporterSide) {
                _handOverPlanDispatcher(i, checkOnly);
                _handOverPlanKeeper(i);
            }
            if (entries[i].isLz && status == HandOverStatus.TODO) {
                entries[i].setDelegate = _handOverDelegate(entries[i].addr) != target;
            }
        }

        if (reporterSide && dispatcherEnv == address(0)) _handOverSharedDispatcher();
        require(
            bytes(unset).length == 0 || _envFlag("ALLOW_UNSET_DISPATCHER"),
            string.concat(
                "reporters without a dispatcher:",
                unset,
                "\n  Set DISPATCHER_ADDRESS or run --set-dispatcher first, or set ALLOW_UNSET_DISPATCHER=true"
            )
        );
        if (_envFlag("ALLOW_UNSET_DISPATCHER")) _handOverLogUnset();
        require(
            bytes(refusals).length == 0,
            string.concat("HandOver refused, nothing was sent. Fix these first:", refusals)
        );
    }

    /// @dev Without DISPATCHER_ADDRESS every reporter is checked against its own dispatcher, so they must all hold the
    /// same one: the route's gateway calls every reporter in one dispatch, and a reporter on another dispatcher
    /// reverts it. The deployer would hand over with that dispatcher, so it is checked (reverting) when a reporter it
    /// governs holds it; on the target's reporters only, phase 3 reports a bad one as a governor action.
    function _handOverSharedDispatcher() private view {
        address first;
        string memory seen;
        bool differ;
        bool todoHolds;
        for (uint256 i = 0; i < entries.length; i++) {
            HandOverEntry storage e = entries[i];
            if (e.status != HandOverStatus.TODO && e.status != HandOverStatus.ALREADY) continue;
            if (e.expectedDispatcher == address(0)) continue;
            if (first == address(0)) first = e.expectedDispatcher;
            else if (e.expectedDispatcher != first) differ = true;
            if (e.status == HandOverStatus.TODO) todoHolds = true;
            seen = string.concat(seen, "\n  ", e.key, ": ", vm.toString(e.expectedDispatcher));
        }
        require(
            !differ,
            string.concat(
                "the reporters on this chain point at different dispatchers:",
                seen,
                "\n  Set DISPATCHER_ADDRESS to the route's gateway, so HandOver checks each reporter against it"
            )
        );
        if (!todoHolds) return;
        string memory problem = _dispatcherProblem(first, yaho);
        require(
            bytes(problem).length == 0,
            string.concat(
                "the reporters' dispatcher fails the check:",
                seen,
                "\n  dispatcher ",
                vm.toString(first),
                " ",
                problem,
                "; the reporters accept Yaho ",
                vm.toString(yaho)
            )
        );
        _checkDispatcher(first, yaho);
    }

    /// @dev With ALLOW_UNSET_DISPATCHER: the governor's transaction for each reporter left without a dispatcher, the
    /// one handed over now and the one the target already governs. A template with the gateway left to substitute,
    /// never a zero-address call.
    function _handOverLogUnset() private view {
        bool any;
        for (uint256 i = 0; i < entries.length; i++) {
            if (_handOverUnset(entries[i])) any = true;
        }
        if (!any) return;
        console.log("WARNING: INCOMPLETE ROUTE: these reporters have no dispatcher and revert every dispatch.");
        console.log(
            "  After handover the governor sends one transaction per reporter (substitute and validate the gateway first, never zero):"
        );
        for (uint256 i = 0; i < entries.length; i++) {
            HandOverEntry storage e = entries[i];
            if (!_handOverUnset(e)) continue;
            console.log(
                string.concat(
                    "    ",
                    e.key,
                    ": to ",
                    vm.toString(e.addr),
                    ', value 0, data: cast calldata "setDispatcher(address)" <GATEWAY_ADDRESS>'
                )
            );
        }
    }

    /// @dev A reporter checked in phase 1 that ends with no dispatcher: none now and no DISPATCHER_ADDRESS.
    function _handOverUnset(HandOverEntry storage e) private view returns (bool) {
        return
            e.isReporter &&
            e.expectedDispatcher == address(0) &&
            (e.status == HandOverStatus.TODO || e.status == HandOverStatus.ALREADY);
    }

    /// @dev The route values of a reporter: the ones its deploy script read back, from the same env.
    function _handOverReporterValues(uint256 i) private {
        address r = entries[i].addr;
        _handOverExpect(i, Reporter(r).YAHO() == yaho, "YAHO()", "it serves another Yaho: redeploy it", "");
        bytes32 key = keccak256(bytes(entries[i].key));

        if (key == keccak256("ccipReporter")) {
            CCIPReporterInputs memory inputs = _ccipReporterEnv();
            CCIPReporter reporter = CCIPReporter(payable(r));
            _handOverCounterpart(i);
            _handOverExpect(
                i,
                address(reporter.CCIP_ROUTER()) == inputs.router,
                "CCIP_ROUTER()",
                "immutable: redeploy",
                ""
            );
            _handOverExpect(
                i,
                reporter.chainSelectors(ADAPTER_CHAIN_ID) == inputs.adapterChainSelector,
                "chainSelectors(ADAPTER_CHAIN_ID) != CCIP_ADAPTER_CHAIN_SELECTOR",
                "setChainSelectorByChainId",
                abi.encodeCall(CCIPReporter.setChainSelectorByChainId, (ADAPTER_CHAIN_ID, inputs.adapterChainSelector))
            );
            _handOverExpect(
                i,
                reporter.feeToken() == inputs.feeToken,
                "feeToken() != CCIP_FEE_TOKEN",
                "setFeeToken",
                abi.encodeCall(CCIPReporter.setFeeToken, (inputs.feeToken))
            );
            // Without CCIP_GAS_LIMIT the fix restores the reporter's 200000 default.
            uint256 gasFix = inputs.gasLimitSet ? inputs.gasLimit : 200_000;
            _handOverExpectGas(
                i,
                "defaultGasLimit()",
                reporter.defaultGasLimit(),
                "setDefaultGasLimit",
                abi.encodeCall(CCIPReporter.setDefaultGasLimit, (gasFix))
            );
        } else if (key == keccak256("deBridgeReporter")) {
            DeBridgeReporterInputs memory inputs = _deBridgeReporterEnv();
            DeBridgeReporter reporter = DeBridgeReporter(payable(r));
            _handOverCounterpart(i);
            _handOverExpect(
                i,
                address(reporter.deBridgeGate()) == inputs.gate,
                "deBridgeGate()",
                "immutable: redeploy",
                ""
            );
            _handOverExpect(
                i,
                reporter.deBridgeChainIds(ADAPTER_CHAIN_ID) == inputs.adapterDeBridgeChainId,
                "deBridgeChainIds(ADAPTER_CHAIN_ID) != DEBRIDGE_ADAPTER_CHAIN_ID",
                "setDeBridgeChainIdByChainId",
                abi.encodeCall(
                    DeBridgeReporter.setDeBridgeChainIdByChainId,
                    (ADAPTER_CHAIN_ID, inputs.adapterDeBridgeChainId)
                )
            );
            _handOverExpectFee(i, reporter.fee(), inputs.fee, abi.encodeCall(DeBridgeReporter.setFee, (inputs.fee)));
        } else if (key == keccak256("axelarReporter")) {
            AxelarReporterInputs memory inputs = _axelarReporterEnv();
            AxelarReporter reporter = AxelarReporter(payable(r));
            _handOverCounterpart(i);
            _handOverExpect(
                i,
                address(reporter.AXELAR_GATEWAY()) == inputs.gateway &&
                    address(reporter.AXELAR_GAS_SERVICE()) == inputs.gasService,
                "AXELAR_GATEWAY() / AXELAR_GAS_SERVICE()",
                "immutable: redeploy",
                ""
            );
            _handOverExpect(
                i,
                keccak256(bytes(reporter.chainNames(ADAPTER_CHAIN_ID))) == keccak256(bytes(inputs.adapterChainName)),
                "chainNames(ADAPTER_CHAIN_ID) != AXELAR_ADAPTER_CHAIN_NAME",
                "setChainNameByChainId",
                abi.encodeCall(AxelarReporter.setChainNameByChainId, (ADAPTER_CHAIN_ID, inputs.adapterChainName))
            );
            _handOverExpectFee(i, reporter.fee(), inputs.fee, abi.encodeCall(AxelarReporter.setFee, (inputs.fee)));
        } else if (key == keccak256("lzReporter")) {
            _handOverLzReporterValues(i);
        } else {
            VeaReporterInputs memory inputs = _veaReporterEnv();
            VeaReporter reporter = VeaReporter(r);
            address adapter = _handOverCounterpart(i);
            _handOverExpect(i, address(reporter.VEA_INBOX()) == inputs.inbox, "VEA_INBOX()", "immutable: redeploy", "");
            if (adapter != address(0)) {
                _handOverExpect(
                    i,
                    reporter.ADAPTER() == adapter,
                    "ADAPTER() != state veaAdapter",
                    "immutable: redeploy",
                    ""
                );
            }
            _handOverExpect(
                i,
                reporter.EXPECTED_TARGET_CHAIN_ID() == ADAPTER_CHAIN_ID,
                "EXPECTED_TARGET_CHAIN_ID() != ADAPTER_CHAIN_ID",
                "immutable: redeploy",
                ""
            );
        }
    }

    function _handOverLzReporterValues(uint256 i) private {
        LZReporterInputs memory inputs = _lzReporterEnv();
        LayerZeroReporter reporter = LayerZeroReporter(payable(entries[i].addr));
        address adapter = _handOverCounterpart(i);
        bytes32 peer = bytes32(uint256(uint160(adapter)));
        _handOverExpect(
            i,
            address(reporter.LAYER_ZERO_ENDPOINT()) == inputs.endpoint,
            "LAYER_ZERO_ENDPOINT()",
            "immutable: redeploy",
            ""
        );
        if (adapter != address(0)) {
            _handOverExpect(
                i,
                reporter.peers(inputs.adapterEid) == peer,
                "peers(LZ_ADAPTER_EID) != state lzAdapter",
                "setPeer",
                abi.encodeCall(OAppCore.setPeer, (inputs.adapterEid, peer))
            );
        }
        _handOverExpect(
            i,
            reporter.endpointIds(ADAPTER_CHAIN_ID) == inputs.adapterEid,
            "endpointIds(ADAPTER_CHAIN_ID) != LZ_ADAPTER_EID",
            "setEndpointIdByChainId",
            abi.encodeCall(LayerZeroReporter.setEndpointIdByChainId, (ADAPTER_CHAIN_ID, inputs.adapterEid))
        );
        _handOverExpectGas(
            i,
            "gasLimit()",
            reporter.gasLimit(),
            "setGasLimit",
            abi.encodeCall(LayerZeroReporter.setGasLimit, (inputs.gasLimit))
        );
        ILZEndpointViews endpoint = ILZEndpointViews(inputs.endpoint);
        bool pinned = !endpoint.isDefaultSendLibrary(address(reporter), inputs.adapterEid) &&
            endpoint.getSendLibrary(address(reporter), inputs.adapterEid) == inputs.sendLib;
        _handOverExpect(
            i,
            pinned,
            "send library not pinned to LZ_SEND_LIB",
            "rerun ConfigureLZReporter (the endpoint delegate pins it)",
            ""
        );
        if (pinned) {
            try
                _handOverLzVerifier().verify(
                    inputs.endpoint,
                    address(reporter),
                    inputs.sendLib,
                    inputs.adapterEid,
                    inputs.uln,
                    true,
                    inputs.executor,
                    inputs.maxMessageSize
                )
            {} catch Error(string memory reason) {
                _handOverExpect(i, false, reason, "rerun ConfigureLZReporter (the endpoint delegate sets it)", "");
            }
        }
    }

    function _handOverAdapterValues(uint256 i) private {
        address a = entries[i].addr;
        bytes32 key = keccak256(bytes(entries[i].key));

        if (key == keccak256("ccipAdapter")) {
            CCIPAdapterInputs memory inputs = _ccipAdapterEnv();
            CCIPAdapter adapter = CCIPAdapter(a);
            address reporter = _handOverCounterpart(i);
            _handOverExpect(i, adapter.getRouter() == inputs.router, "getRouter()", "immutable: redeploy", "");
            if (reporter != address(0)) {
                _handOverExpect(
                    i,
                    adapter.enabledReporters(inputs.reporterChainSelector) == reporter &&
                        adapter.chainIds(inputs.reporterChainSelector) == REPORTER_CHAIN_ID,
                    "enabledReporters / chainIds(CCIP_REPORTER_CHAIN_SELECTOR)",
                    "setReporterByChain",
                    abi.encodeCall(
                        CCIPAdapter.setReporterByChain,
                        (REPORTER_CHAIN_ID, inputs.reporterChainSelector, reporter)
                    )
                );
            }
        } else if (key == keccak256("deBridgeAdapter")) {
            DeBridgeAdapterInputs memory inputs = _deBridgeAdapterEnv();
            DeBridgeAdapter adapter = DeBridgeAdapter(a);
            address reporter = _handOverCounterpart(i);
            _handOverExpect(
                i,
                address(adapter.deBridgeGate()) == inputs.gate,
                "deBridgeGate()",
                "immutable: redeploy",
                ""
            );
            _handOverExpect(
                i,
                adapter.chainIds(inputs.reporterDeBridgeChainId) == REPORTER_CHAIN_ID,
                "chainIds(DEBRIDGE_REPORTER_CHAIN_ID) != REPORTER_CHAIN_ID",
                "setChainIdByDeBridgeChainId",
                abi.encodeCall(
                    DeBridgeAdapter.setChainIdByDeBridgeChainId,
                    (inputs.reporterDeBridgeChainId, REPORTER_CHAIN_ID)
                )
            );
            if (reporter != address(0)) {
                _handOverExpect(
                    i,
                    adapter.enabledReporters(REPORTER_CHAIN_ID) == reporter,
                    "enabledReporters(REPORTER_CHAIN_ID) != state deBridgeReporter",
                    "setReporterByChainId",
                    abi.encodeCall(DeBridgeAdapter.setReporterByChainId, (REPORTER_CHAIN_ID, reporter))
                );
            }
        } else if (key == keccak256("axelarAdapter")) {
            AxelarAdapterInputs memory inputs = _axelarAdapterEnv();
            AxelarAdapter adapter = AxelarAdapter(a);
            address reporter = _handOverCounterpart(i);
            _handOverExpect(i, address(adapter.gateway()) == inputs.gateway, "gateway()", "immutable: redeploy", "");
            if (reporter != address(0)) {
                bytes32 nameHash = keccak256(bytes(inputs.reporterChainName));
                // Axelar delivers the source address checksummed; vm.toString gives that form.
                string memory reporterString = vm.toString(reporter);
                _handOverExpect(
                    i,
                    adapter.chainIds(nameHash) == REPORTER_CHAIN_ID &&
                        adapter.enabledReporters(nameHash) == keccak256(bytes(reporterString)),
                    "enabledReporters / chainIds(AXELAR_REPORTER_CHAIN_NAME)",
                    "setReporterByChain",
                    abi.encodeCall(
                        AxelarAdapter.setReporterByChain,
                        (REPORTER_CHAIN_ID, inputs.reporterChainName, reporterString)
                    )
                );
            }
        } else if (key == keccak256("lzAdapter")) {
            _handOverLzAdapterValues(i);
        } else {
            VeaAdapterInputs memory inputs = _veaAdapterEnv();
            VeaAdapter adapter = VeaAdapter(a);
            address reporter = _handOverCounterpart(i);
            _handOverExpect(i, adapter.VEA_OUTBOX() == inputs.outbox, "VEA_OUTBOX()", "immutable: redeploy", "");
            _handOverExpect(
                i,
                adapter.SOURCE_CHAIN_ID() == REPORTER_CHAIN_ID,
                "SOURCE_CHAIN_ID() != REPORTER_CHAIN_ID",
                "immutable: redeploy",
                ""
            );
            if (reporter != address(0)) {
                _handOverExpect(
                    i,
                    adapter.REPORTER() == reporter,
                    "REPORTER() != state veaReporter",
                    "setReporter (SetupVeaAdapter)",
                    abi.encodeCall(VeaAdapter.setReporter, (reporter))
                );
            }
        }
    }

    function _handOverLzAdapterValues(uint256 i) private {
        LZAdapterInputs memory inputs = _lzAdapterEnv();
        LayerZeroAdapter adapter = LayerZeroAdapter(entries[i].addr);
        address reporter = _handOverCounterpart(i);
        bytes32 peer = bytes32(uint256(uint160(reporter)));
        _handOverExpect(
            i,
            adapter.LAYER_ZERO_ENDPOINT() == inputs.endpoint,
            "LAYER_ZERO_ENDPOINT()",
            "immutable: redeploy",
            ""
        );
        if (reporter != address(0)) {
            _handOverExpect(
                i,
                adapter.peers(inputs.reporterEid) == peer,
                "peers(LZ_REPORTER_EID) != state lzReporter",
                "setPeer",
                abi.encodeCall(OAppCore.setPeer, (inputs.reporterEid, peer))
            );
            // lzReceive needs the peer, the enabled reporter and a nonzero chain id for the eid.
            _handOverExpect(
                i,
                adapter.enabledReporters(inputs.reporterEid) == reporter &&
                    adapter.chainIds(inputs.reporterEid) == REPORTER_CHAIN_ID,
                "enabledReporters / chainIds(LZ_REPORTER_EID)",
                "setReporterByChain",
                abi.encodeCall(LayerZeroAdapter.setReporterByChain, (REPORTER_CHAIN_ID, inputs.reporterEid, reporter))
            );
        }
        (address lib, bool isDefault) = _lzReceiveLibrary(inputs.endpoint, address(adapter), inputs.reporterEid);
        bool pinned = !isDefault && lib == inputs.receiveLib;
        _handOverExpect(
            i,
            pinned,
            "receive library not pinned to LZ_RECEIVE_LIB",
            "the endpoint delegate pins it (endpoint.setReceiveLibrary), or redeploy the adapter",
            ""
        );
        if (pinned) {
            try
                _handOverLzVerifier().verify(
                    inputs.endpoint,
                    address(adapter),
                    inputs.receiveLib,
                    inputs.reporterEid,
                    inputs.uln,
                    false,
                    address(0),
                    0
                )
            {} catch Error(string memory reason) {
                _handOverExpect(
                    i,
                    false,
                    reason,
                    "the adapter's endpoint delegate calls endpoint.setConfig (no script does it; see README, LayerZero)",
                    ""
                );
            }
        }
    }

    /// @dev The dispatcher a reporter must end with. On a contract the deployer governs: an unset one gets
    /// DISPATCHER_ADDRESS (checked in setup), or stays unset only with ALLOW_UNSET_DISPATCHER; a set one must be a
    /// VouchedDispatcher on the route's Yaho and equal DISPATCHER_ADDRESS when that is set. On one the target
    /// governs, only the governor can change it: phase 3 reports a bad one as a governor action.
    function _handOverPlanDispatcher(uint256 i, bool checkOnly) private {
        HandOverEntry storage e = entries[i];
        address current = Reporter(e.addr).dispatcher();

        if (e.status == HandOverStatus.TODO) {
            if (current == address(0)) {
                e.expectedDispatcher = dispatcherEnv;
                e.setDispatcher = dispatcherEnv != address(0);
                if (dispatcherEnv == address(0)) {
                    unset = string.concat(unset, "\n    ", e.key, " ", vm.toString(e.addr));
                }
                return;
            }
            e.expectedDispatcher = current;
            if (dispatcherEnv != address(0) && current != dispatcherEnv) {
                refusals = string.concat(
                    refusals,
                    "\n  ",
                    e.key,
                    ": dispatcher is ",
                    vm.toString(current),
                    ", DISPATCHER_ADDRESS is ",
                    vm.toString(dispatcherEnv),
                    ": run --set-dispatcher with REPLACE_DISPATCHER=true, or fix DISPATCHER_ADDRESS"
                );
            }
            // Equal to DISPATCHER_ADDRESS: setup checked it. Without DISPATCHER_ADDRESS, _handOverSharedDispatcher
            // checks the one dispatcher all reporters share after phase 1 has seen them all.
            return;
        }

        // ALREADY: phase 3 compares and checks it and prints the governor action.
        e.expectedDispatcher = dispatcherEnv != address(0) ? dispatcherEnv : current;
        if (e.expectedDispatcher == address(0) && checkOnly) {
            unset = string.concat(unset, "\n    ", e.key, " ", vm.toString(e.addr));
        }
    }

    /// @dev The keeper a reporter must end with. Handed over in this run: NEW_KEEPER, else KEEPER_ADDRESS, else its
    /// current keeper. Already with the target: NEW_KEEPER when set, else its current keeper (the governor may have
    /// changed it since). The keeper receives every withdrawal, so a paid reporter keeps the deployer only with
    /// KEEP_DEPLOYER_KEEPER.
    function _handOverPlanKeeper(uint256 i) private {
        HandOverEntry storage e = entries[i];
        bool todo = e.status == HandOverStatus.TODO;
        address current = KeeperGoverned(e.addr).keeper();
        address expected = current;
        // Where `expected` came from, for the refusal when it is the deployer.
        string memory source = "the current keeper is the deployer and neither NEW_KEEPER nor KEEPER_ADDRESS is set";
        if (_envSet("NEW_KEEPER")) {
            expected = vm.envAddress("NEW_KEEPER");
            require(expected != address(0), "NEW_KEEPER is zero");
            source = "NEW_KEEPER is the deployer";
        } else if (todo && _envSet("KEEPER_ADDRESS")) {
            expected = vm.envAddress("KEEPER_ADDRESS");
            require(expected != address(0), "KEEPER_ADDRESS is zero");
            source = "KEEPER_ADDRESS is the deployer and NEW_KEEPER is not set";
        }
        if (expected == address(0)) {
            require(!todo, string.concat(e.key, " has no keeper: set NEW_KEEPER"));
            // Phase 3 skips the keeper and refund comparisons of this entry; the action below covers them.
            pending = string.concat(
                pending,
                "\n  ",
                e.key,
                " has no keeper: governor action changeKeeper(<NEW_KEEPER>)",
                e.isLz ? " and setDefaultRefundAddress(<NEW_KEEPER>)" : "",
                ", or rerun with NEW_KEEPER set"
            );
            return;
        }
        e.expectedKeeper = expected;

        if (e.isPaid && expected == deployer) {
            if (_envFlag("KEEP_DEPLOYER_KEEPER")) {
                console.log(string.concat("WARNING: ", e.key, " keeps the deployer as keeper (KEEP_DEPLOYER_KEEPER)"));
                _handOverLogBalances(i);
            } else if (todo) {
                refusals = string.concat(
                    refusals,
                    "\n  ",
                    e.key,
                    ": ",
                    source,
                    "; the deployer would stay keeper and receive every withdrawal. Set NEW_KEEPER to another address, or KEEP_DEPLOYER_KEEPER=true"
                );
            } else {
                // The target governs it: only the governor can move the keeper now. KEEPER_ADDRESS is not read here.
                pending = string.concat(
                    pending,
                    "\n  ",
                    e.key,
                    " ",
                    vm.toString(e.addr),
                    _envSet("NEW_KEEPER")
                        ? ": NEW_KEEPER is the deployer, which would receive every withdrawal: set NEW_KEEPER to another address, or KEEP_DEPLOYER_KEEPER=true to accept it"
                        : ': the keeper is still the deployer, which receives every withdrawal: governor action (cast calldata "changeKeeper(address)" <NEW_KEEPER>), or KEEP_DEPLOYER_KEEPER=true to accept it'
                );
            }
        }
        if (!todo) return;
        e.setKeeper = current != expected;
        if (e.isLz) e.setRefund = LayerZeroReporter(payable(e.addr)).refundAddress() != expected;
    }

    /*//////////////////////////////////////////////////////////////
                        PHASE 2: ONE BROADCAST
    //////////////////////////////////////////////////////////////*/

    function _handOverExecute(uint256 pk) private {
        bool any;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].status == HandOverStatus.TODO) any = true;
        }
        if (!any) {
            console.log("nothing governed by the deployer on this chain: no transaction");
            return;
        }

        vm.startBroadcast(pk);
        for (uint256 i = 0; i < entries.length; i++) {
            HandOverEntry memory e = entries[i];
            if (e.status != HandOverStatus.TODO) continue;
            if (e.setDispatcher) Reporter(e.addr).setDispatcher(e.expectedDispatcher);
            if (e.setKeeper) KeeperGoverned(e.addr).changeKeeper(e.expectedKeeper);
            if (e.setRefund) LayerZeroReporter(payable(e.addr)).setDefaultRefundAddress(e.expectedKeeper);
            if (e.setDelegate) OAppCore(e.addr).setDelegate(target);
        }
        // The governor moves last: every call above needs the deployer as governor (owner on LayerZero).
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].status == HandOverStatus.TODO) Governed(entries[i].addr).changeGovernor(target);
        }
        vm.stopBroadcast();
    }

    /*//////////////////////////////////////////////////////////////
                        PHASE 3: READ BACK
    //////////////////////////////////////////////////////////////*/

    /// @dev After the broadcast (or, in check(), against the chain as it is): every contract handed over in this run
    /// must hold the target as governor, owner and endpoint delegate, the expected keeper, refund address and
    /// dispatcher, or the run reverts. A contract the target already governed lists the governor actions it needs.
    /// A contract missing from the route file while its counterpart is recorded fails too: half a bridge carries
    /// no message.
    function _handOverPhase3(bool checkOnly) private {
        string memory failed;
        console.log("HandOver summary, chain", block.chainid);
        for (uint256 i = 0; i < entries.length; i++) {
            HandOverEntry memory e = entries[i];
            string memory line = string.concat("  ", e.key, ": ");
            if (e.status == HandOverStatus.MISSING) {
                address other = _stateAddressOrZero(string.concat(".", e.counterpart));
                if (other == address(0)) {
                    console.log(string.concat(line, "MISSING (not in the route file)"));
                } else {
                    console.log(
                        string.concat(line, "MISSING (not in the route file), while ", e.counterpart, " is recorded:"),
                        other
                    );
                    failed = string.concat(
                        failed,
                        "\n  ",
                        e.key,
                        " is missing while ",
                        e.counterpart,
                        " ",
                        vm.toString(other),
                        " is recorded: deploy it (README per-step commands)"
                    );
                }
                continue;
            }
            if (e.status == HandOverStatus.LEGACY) {
                console.log(string.concat(line, "LEGACY (pre-#529, skipped)"), e.addr);
                continue;
            }
            if (e.status == HandOverStatus.TODO && checkOnly) {
                console.log(string.concat(line, "NOT HANDED OVER (governed by the deployer)"), e.addr);
                failed = string.concat(failed, "\n  ", e.key, " is still governed by the deployer: run --handover");
                continue;
            }

            string memory problems = _handOverRoles(i);
            bool incomplete = e.isReporter && Reporter(e.addr).dispatcher() == address(0);
            bool unproven = _handOverUnproven(e);
            if (unproven) {
                failed = string.concat(
                    failed,
                    "\n  ",
                    e.key,
                    ": dispatcher ",
                    vm.toString(Reporter(e.addr).dispatcher()),
                    " ",
                    DISPATCHER_UNPROVEN
                );
            }
            if (bytes(problems).length > 0) {
                if (e.status == HandOverStatus.TODO) {
                    revert(string.concat(e.key, " read-back after the broadcast:", problems));
                }
                pending = string.concat(pending, problems);
                console.log(string.concat(line, "NEEDS_GOVERNOR (actions below)"), e.addr);
            } else if (unproven) {
                console.log(string.concat(line, "UNPROVEN (dispatcher: set DISPATCHER_ADDRESS, see below)"), e.addr);
            } else {
                string memory label = e.status == HandOverStatus.TODO ? "HANDED_OVER" : "ALREADY";
                if (incomplete) label = string.concat(label, ", INCOMPLETE (dispatcher UNSET, ALLOW_UNSET_DISPATCHER)");
                console.log(string.concat(line, label), e.addr);
            }
            _handOverLogRoles(i);
            if (e.isPaid) _handOverLogOperating(i);
        }

        if (bytes(pending).length > 0) {
            // `pending` starts with a newline, so it begins on the line after the header.
            console.log(
                string.concat(
                    "GOVERNOR ACTIONS PENDING on chain ",
                    vm.toString(block.chainid),
                    " (value 0 each):",
                    pending
                )
            );
            if (checkOnly) failed = string.concat(failed, "\n  governor actions pending (listed above)");
        }
        require(
            bytes(failed).length == 0,
            string.concat(checkOnly ? "HandOver check failed:" : "HandOver refused, nothing was sent:", failed)
        );
    }

    /// @dev A reporter the target governs whose dispatcher has no yaho() getter and is not DISPATCHER_ADDRESS: its Yaho
    /// cannot be proven without DISPATCHER_ADDRESS and DISPATCHER_YAHO.
    function _handOverUnproven(HandOverEntry memory e) private view returns (bool) {
        if (!e.isReporter || e.status != HandOverStatus.ALREADY) return false;
        address dispatcher = Reporter(e.addr).dispatcher();
        if (dispatcher == address(0) || dispatcher != e.expectedDispatcher) return false;
        return _handOverIs(_dispatcherProblem(dispatcher, yaho), DISPATCHER_UNPROVEN);
    }

    /// @dev The role values of one contract, each mismatch with the call that fixes it; empty when all match.
    function _handOverRoles(uint256 i) private view returns (string memory problems) {
        HandOverEntry memory e = entries[i];
        if (Governed(e.addr).governor() != target) {
            problems = _handOverProblem(problems, e, "governor", abi.encodeCall(Governed.changeGovernor, (target)));
        }
        if (e.isLz) {
            if (OAppCore(e.addr).owner() != target) problems = _handOverProblem(problems, e, "owner", "");
            if (_handOverDelegate(e.addr) != target) {
                problems = _handOverProblem(
                    problems,
                    e,
                    "endpoint delegate",
                    abi.encodeCall(OAppCore.setDelegate, (target))
                );
            }
        }
        if (!e.isReporter) return problems;

        if (e.expectedKeeper != address(0) && KeeperGoverned(e.addr).keeper() != e.expectedKeeper) {
            problems = _handOverProblem(
                problems,
                e,
                "keeper",
                abi.encodeCall(KeeperGoverned.changeKeeper, (e.expectedKeeper))
            );
        }
        if (
            e.expectedKeeper != address(0) &&
            e.isLz &&
            LayerZeroReporter(payable(e.addr)).refundAddress() != e.expectedKeeper
        ) {
            problems = _handOverProblem(
                problems,
                e,
                "refundAddress",
                abi.encodeCall(LayerZeroReporter.setDefaultRefundAddress, (e.expectedKeeper))
            );
        }
        address dispatcher = Reporter(e.addr).dispatcher();
        if (e.expectedDispatcher == address(0)) {
            // Unset: allowed only with ALLOW_UNSET_DISPATCHER (phase 1); never print a zero-address call.
            if (dispatcher != address(0) || !_envFlag("ALLOW_UNSET_DISPATCHER")) {
                problems = string.concat(
                    problems,
                    "\n  ",
                    e.key,
                    " ",
                    vm.toString(e.addr),
                    ": dispatcher unset; the governor calls setDispatcher(<GATEWAY_ADDRESS>) after validating the gateway"
                );
            }
        } else if (dispatcher != e.expectedDispatcher) {
            problems = _handOverProblem(
                problems,
                e,
                "dispatcher",
                abi.encodeCall(Reporter.setDispatcher, (e.expectedDispatcher))
            );
        } else if (e.status == HandOverStatus.ALREADY) {
            // Phase 1 checked a TODO entry's dispatcher (reverting); the target's own is a governor action.
            string memory problem = _dispatcherProblem(dispatcher, yaho);
            // An unproven dispatcher is the operator's env to fix, not a governor action: phase 3 fails on it.
            if (bytes(problem).length > 0 && !_handOverIs(problem, DISPATCHER_UNPROVEN)) {
                problems = string.concat(
                    problems,
                    "\n  ",
                    e.key,
                    " ",
                    vm.toString(e.addr),
                    ": dispatcher ",
                    vm.toString(dispatcher),
                    " ",
                    problem,
                    '; the governor calls setDispatcher(<GATEWAY_ADDRESS>) after validating the gateway (cast calldata "setDispatcher(address)" <GATEWAY_ADDRESS>)'
                );
            }
        }
    }

    /// @dev The roles read back from the chain, for the summary.
    function _handOverLogRoles(uint256 i) private view {
        HandOverEntry memory e = entries[i];
        console.log("    governor:", Governed(e.addr).governor());
        if (e.isLz) console.log("    endpoint delegate:", _handOverDelegate(e.addr));
        if (!e.isReporter) return;
        console.log("    keeper:", KeeperGoverned(e.addr).keeper());
        if (e.isLz) console.log("    refundAddress:", LayerZeroReporter(payable(e.addr)).refundAddress());
        console.log("    dispatcher:", Reporter(e.addr).dispatcher());
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @dev Records a failed route-value check: a refusal on a contract the deployer governs, a governor action on
    /// one the target governs. `data` is the fixing call on the contract, empty when no call fixes it.
    function _handOverExpect(uint256 i, bool ok, string memory field, string memory fix, bytes memory data) private {
        if (ok) return;
        HandOverEntry memory e = entries[i];
        string memory call = data.length == 0
            ? ""
            : string.concat(" (", fix, ": to ", vm.toString(e.addr), " data ", vm.toString(data), ")");
        if (e.status == HandOverStatus.TODO) {
            refusals = string.concat(
                refusals,
                "\n  ",
                e.key,
                " ",
                field,
                data.length == 0
                    ? string.concat(": ", fix)
                    : string.concat(": the deployer fixes it with cast send", call)
            );
        } else {
            pending = string.concat(
                pending,
                "\n  ",
                e.key,
                " ",
                field,
                data.length == 0 ? string.concat(": ", fix) : string.concat(": governor action", call)
            );
        }
    }

    /// @dev fee() must be nonzero unless ALLOW_ZERO_FEE (the keeper can never move it off zero).
    function _handOverExpectFee(uint256 i, uint256 fee, uint256 envFee, bytes memory data) private {
        if (fee != 0 || _envFlag("ALLOW_ZERO_FEE")) return;
        _handOverExpect(i, false, "fee() is 0", "setFee", envFee == 0 ? bytes("") : data);
    }

    /// @dev The live destination gas must be nonzero (the keeper can never move it off zero) and, into a repriced
    /// chain, at least MIN_REPRICED_DEST_GAS unless ALLOW_LOW_DEST_GAS. `data` sets the env value.
    function _handOverExpectGas(
        uint256 i,
        string memory field,
        uint256 live,
        string memory fix,
        bytes memory data
    ) private {
        bool low = _isRepricedChain(ADAPTER_CHAIN_ID) && live < MIN_REPRICED_DEST_GAS;
        if (live != 0 && !low) return;
        if (live != 0 && _envFlag("ALLOW_LOW_DEST_GAS")) {
            console.log(string.concat("WARNING: ", entries[i].key, " ", field, " below the floor:"), live);
            return;
        }
        string memory problem = live == 0
            ? " is 0: no message is delivered"
            : string.concat(
                " is ",
                vm.toString(live),
                ", below ",
                vm.toString(MIN_REPRICED_DEST_GAS),
                " into chain ",
                vm.toString(ADAPTER_CHAIN_ID)
            );
        _handOverExpect(i, false, string.concat(field, problem), fix, data);
    }

    /// @dev The route file's address of the other side's contract. Zero is recorded here as a mismatch (deploy it
    /// first), and the caller then skips the checks that compare against it, so no call with address(0) is printed.
    function _handOverCounterpart(uint256 i) private returns (address counterpart) {
        string memory key = entries[i].counterpart;
        counterpart = _stateAddressOrZero(string.concat(".", key));
        _handOverExpect(
            i,
            counterpart != address(0),
            string.concat("route file has no ", key),
            "deploy it before the handover",
            ""
        );
    }

    function _handOverProblem(
        string memory problems,
        HandOverEntry memory e,
        string memory field,
        bytes memory data
    ) private pure returns (string memory) {
        return
            string.concat(
                problems,
                "\n  ",
                e.key,
                " ",
                field,
                data.length == 0
                    ? " differs from the target"
                    : string.concat(": to ", vm.toString(e.addr), " data ", vm.toString(data))
            );
    }

    function _handOverLzVerifier() private returns (HandOverLzVerifier) {
        if (address(lzVerifier) == address(0)) lzVerifier = new HandOverLzVerifier();
        return lzVerifier;
    }

    function _handOverDelegate(address oapp) private view returns (address) {
        return ILZEndpointViews(address(OAppCore(oapp).endpoint())).delegates(oapp);
    }

    function _handOverLogBalances(uint256 i) private view {
        HandOverEntry memory e = entries[i];
        console.log("    native balance (wei):", e.addr.balance);
        address token;
        if (_handOverIs(e.key, "ccipReporter")) token = CCIPReporter(payable(e.addr)).feeToken();
        if (e.isLz) token = ILZEndpointViews(address(OAppCore(e.addr).endpoint())).nativeToken();
        if (token != address(0)) {
            (bool ok, bytes memory ret) = token.staticcall(abi.encodeWithSignature("balanceOf(address)", e.addr));
            if (ok && ret.length == 32) console.log("    fee token balance:", token, abi.decode(ret, (uint256)));
        }
    }

    /// @dev The values the keeper runs a paid reporter with, for the summary.
    function _handOverLogOperating(uint256 i) private view {
        HandOverEntry memory e = entries[i];
        if (_handOverIs(e.key, "ccipReporter")) {
            CCIPReporter reporter = CCIPReporter(payable(e.addr));
            console.log("    defaultGasLimit:", reporter.defaultGasLimit());
            console.log("    feeToken:", reporter.feeToken());
        } else if (_handOverIs(e.key, "deBridgeReporter")) {
            console.log("    fee (wei):", DeBridgeReporter(payable(e.addr)).fee());
        } else if (_handOverIs(e.key, "axelarReporter")) {
            console.log("    fee (wei):", AxelarReporter(payable(e.addr)).fee());
        } else if (e.isLz) {
            console.log("    gasLimit:", LayerZeroReporter(payable(e.addr)).gasLimit());
        }
        _handOverLogBalances(i);
    }

    function _handOverGetAddress(address account, string memory getter) private view returns (bool, address) {
        (bool ok, bytes memory ret) = account.staticcall(abi.encodeWithSignature(getter));
        if (!ok || ret.length != 32 || uint256(bytes32(ret)) >> 160 != 0) return (false, address(0));
        return (true, abi.decode(ret, (address)));
    }

    function _handOverIs(string memory a, string memory b) private pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console} from "forge-std/console.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/libraries/Client.sol";
import {ICCIPRouterViews} from "../helpers/BridgeViews.sol";
import {DestinationGas} from "../helpers/DestinationGas.sol";
import {ReporterFunding} from "../helpers/ReporterFunding.sol";

struct CCIPReporterInputs {
    address router;
    /// @dev The adapter chain's CCIP selector, which the reporter maps ADAPTER_CHAIN_ID to.
    uint64 adapterChainSelector;
    /// @dev address(0) pays CCIP fees in native.
    address feeToken;
    bool gasLimitSet;
    uint256 gasLimit;
    /// @dev Zero from _ccipReporterEnv.
    uint256 funding;
}

struct CCIPAdapterInputs {
    address router;
    /// @dev The reporter chain's CCIP selector, which the adapter maps to REPORTER_CHAIN_ID.
    uint64 reporterChainSelector;
    /// @dev The router's live off-ramp for messages from the reporter chain; zero from _ccipAdapterEnv.
    address offRamp;
}

/// @dev The CCIP route's env and chain checks. Views only and no state reads, so Preflight can run them before the
/// first broadcast. The Env functions read only the keys HandOver compares and call no CCIP contract.
abstract contract CCIPInputs is DestinationGas, ReporterFunding {
    /// @dev CCIPReporter.defaultGasLimit before any setDefaultGasLimit.
    uint256 private constant CCIP_REPORTER_DEFAULT_GAS_LIMIT = 200_000;

    /// @dev The reporter side's env: router, adapter selector, fee token and gas limit.
    function _ccipReporterEnv() internal view returns (CCIPReporterInputs memory inputs) {
        require(ADAPTER_CHAIN_ID != 0, "ADAPTER_CHAIN_ID must be nonzero");
        inputs.router = vm.envOr("CCIP_REPORTER_ROUTER", address(0));
        _requireCode("CCIP_REPORTER_ROUTER", inputs.router);
        inputs.adapterChainSelector = _envSelector("CCIP_ADAPTER_CHAIN_SELECTOR");

        if (_envSet("CCIP_FEE_TOKEN")) {
            inputs.feeToken = vm.envAddress("CCIP_FEE_TOKEN");
            if (inputs.feeToken == address(0)) {
                revert(
                    _requiresFeeToken(block.chainid)
                        ? string.concat(
                            "CCIP_FEE_TOKEN is zero: chain ",
                            vm.toString(block.chainid),
                            " has no native fees, set the ERC20 fee token"
                        )
                        : "CCIP_FEE_TOKEN is zero: leave it empty to pay in native"
                );
            }
            _requireCode("CCIP_FEE_TOKEN", inputs.feeToken);
        } else {
            require(
                !_requiresFeeToken(block.chainid),
                string.concat("CCIP_FEE_TOKEN is required on chain ", vm.toString(block.chainid), " (no native fees)")
            );
        }

        (inputs.gasLimitSet, inputs.gasLimit) = _ccipGasLimit();
    }

    /// @dev Run on the reporter chain: the env, then the router's lane, a fee quote, this chain's own selector and the
    /// funding. Also checks the adapter side's keys are well formed (no adapter-chain calls).
    function _ccipReporterInputs() internal view returns (CCIPReporterInputs memory inputs) {
        inputs = _ccipReporterEnv();
        require(
            _ccipChainSupported(inputs.router, inputs.adapterChainSelector),
            string.concat(
                "CCIP_ADAPTER_CHAIN_SELECTOR ",
                vm.toString(inputs.adapterChainSelector),
                " is not supported by the router on chain ",
                vm.toString(block.chainid)
            )
        );
        _ccipCheckFee(inputs);

        inputs.funding = _requiredFunding("CCIP_REPORTER_FUNDING");
        // _fund refuses native funding for an ERC20 fee token; fail here, before the reporter is deployed.
        require(
            inputs.feeToken == address(0) || inputs.funding == 0,
            "CCIP_REPORTER_FUNDING must be 0 when CCIP_FEE_TOKEN is set: transfer the fee token instead"
        );

        _envAddressRequired("CCIP_ADAPTER_ROUTER");
        uint64 reporterChainSelector = _envSelector("CCIP_REPORTER_CHAIN_SELECTOR");
        require(
            reporterChainSelector != inputs.adapterChainSelector,
            "CCIP_REPORTER_CHAIN_SELECTOR and CCIP_ADAPTER_CHAIN_SELECTOR must differ"
        );
        // The on-ramp to the adapter chain knows this chain's own selector; the only place it can be checked.
        _ccipRequireLocalSelector(
            "CCIP_REPORTER_CHAIN_SELECTOR",
            reporterChainSelector,
            _ccipOnRamp(inputs.router, inputs.adapterChainSelector)
        );
    }

    /// @dev The adapter side's env: router and reporter selector.
    function _ccipAdapterEnv() internal view returns (CCIPAdapterInputs memory inputs) {
        require(REPORTER_CHAIN_ID != 0, "REPORTER_CHAIN_ID must be nonzero");
        inputs.router = vm.envOr("CCIP_ADAPTER_ROUTER", address(0));
        _requireCode("CCIP_ADAPTER_ROUTER", inputs.router);
        inputs.reporterChainSelector = _envSelector("CCIP_REPORTER_CHAIN_SELECTOR");
    }

    /// @dev Run on the adapter chain: the router must have a live off-ramp from the reporter chain's selector, and
    /// that off-ramp must name this chain by CCIP_ADAPTER_CHAIN_SELECTOR.
    function _ccipAdapterInputs() internal view returns (CCIPAdapterInputs memory inputs) {
        inputs = _ccipAdapterEnv();
        inputs.offRamp = _ccipOffRamp(inputs.router, inputs.reporterChainSelector);
        console.log("CCIP live off-ramp from the reporter chain:", inputs.offRamp);
        // The off-ramp knows this chain's own selector: a wrong CCIP_ADAPTER_CHAIN_SELECTOR (which the reporter maps
        // ADAPTER_CHAIN_ID to) fails here, the only place it can be checked.
        _ccipRequireLocalSelector(
            "CCIP_ADAPTER_CHAIN_SELECTOR",
            _envSelector("CCIP_ADAPTER_CHAIN_SELECTOR"),
            inputs.offRamp
        );
    }

    /// @dev isChainSupported as a raw staticcall, so an address that is not a router fails with a message naming it.
    function _ccipChainSupported(address router, uint64 selector) private view returns (bool) {
        (bool ok, bytes memory ret) = router.staticcall(abi.encodeCall(ICCIPRouterViews.isChainSupported, (selector)));
        require(
            ok && ret.length == 32,
            string.concat("CCIP_REPORTER_ROUTER ", vm.toString(router), " is not a CCIP router")
        );
        return abi.decode(ret, (bool));
    }

    /// @dev Quotes the message CCIPReporter will send (same receiver size, payload, extra args and fee token), so
    /// a fee token the lane does not accept or a gas limit above the lane's maximum fails before any broadcast.
    function _ccipCheckFee(CCIPReporterInputs memory inputs) private view {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = bytes32(uint256(1));
        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(address(0xdead)),
            data: abi.encode(ids, hashes),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: Client._argsToBytes(
                Client.GenericExtraArgsV2({
                    gasLimit: inputs.gasLimitSet ? inputs.gasLimit : CCIP_REPORTER_DEFAULT_GAS_LIMIT,
                    allowOutOfOrderExecution: true
                })
            ),
            feeToken: inputs.feeToken
        });
        (bool ok, bytes memory ret) = inputs.router.staticcall(
            abi.encodeCall(IRouterClient.getFee, (inputs.adapterChainSelector, message))
        );
        require(
            ok && ret.length == 32,
            string.concat(
                "CCIP router rejects the message for CCIP_ADAPTER_CHAIN_SELECTOR ",
                vm.toString(inputs.adapterChainSelector),
                ": ",
                _ccipRejection(ret)
            )
        );
    }

    /// @dev Names the FeeQuoter/OnRamp errors getFee raises for a bad CCIP_FEE_TOKEN or CCIP_GAS_LIMIT; anything else
    /// is printed raw with a decode hint.
    function _ccipRejection(bytes memory ret) private pure returns (string memory) {
        bytes4 selector = ret.length >= 4 ? bytes4(ret) : bytes4(0);
        if (selector == 0x4c4fc93a) {
            return "MessageGasLimitTooHigh(): CCIP_GAS_LIMIT is above the lane's per-message maximum";
        }
        // TokenNotSupported(address), FeeTokenNotSupported(address) (FeeQuoter), NotAFeeToken(address) (1.5 OnRamp)
        if (selector == 0x06439c6b || selector == 0x2502348c || selector == 0xa7499d20) {
            return string.concat("the lane does not accept CCIP_FEE_TOKEN (", vm.toString(ret), ")");
        }
        if (selector == 0x5247fdce) return "InvalidExtraArgsTag(): the lane does not take GenericExtraArgsV2";
        return string.concat(vm.toString(ret), " (decode with: cast decode-error <data>)");
    }

    /// @dev The router's on-ramp to `destSelector` (isChainSupported already passed, so it has one).
    function _ccipOnRamp(address router, uint64 destSelector) private view returns (address onRamp) {
        (bool ok, bytes memory ret) = router.staticcall(abi.encodeCall(ICCIPRouterViews.getOnRamp, (destSelector)));
        require(
            ok && ret.length == 32,
            string.concat("CCIP_REPORTER_ROUTER ", vm.toString(router), " has no getOnRamp(uint64)")
        );
        onRamp = abi.decode(ret, (address));
        require(
            onRamp.code.length > 0,
            string.concat(
                "CCIP_REPORTER_ROUTER ",
                vm.toString(router),
                ": the on-ramp to CCIP_ADAPTER_CHAIN_SELECTOR ",
                vm.toString(destSelector),
                " is ",
                vm.toString(onRamp),
                ", which has no code"
            )
        );
    }

    /// @dev The router's live off-ramp for `sourceSelector`, after logging every listed one. From 1.6 one OffRamp
    /// serves many lanes and says per source whether it is enabled, while the router keeps legacy EVM2EVMOffRamps
    /// (1.2/1.5) listed so old messages can still execute. List order says nothing about version (EnumerableSet), so
    /// this picks an OffRamp whose source config is enabled for this router. A lane with no OffRamp listed (not yet on
    /// 1.6) falls back to the last listed legacy EVM2EVMOffRamp, with a warning; a listed OffRamp that is not enabled
    /// means the lane is on 1.6 and switched off here, which reverts.
    function _ccipOffRamp(address router, uint64 sourceSelector) private view returns (address offRamp) {
        // A raw staticcall: a try/catch would not catch return data that fails to decode.
        (bool ok, bytes memory ret) = router.staticcall(abi.encodeCall(ICCIPRouterViews.getOffRamps, ()));
        require(
            ok && ret.length >= 64,
            string.concat("CCIP_ADAPTER_ROUTER ", vm.toString(router), ": router has no off-ramp list")
        );
        ICCIPRouterViews.OffRamp[] memory offRamps = abi.decode(ret, (ICCIPRouterViews.OffRamp[]));
        bool listed;
        // The listed OffRamps (1.6+ family) whose source config is disabled or names another router.
        string memory disabled;
        address legacy;
        string memory legacyVersion;
        for (uint256 i = 0; i < offRamps.length; i++) {
            address ramp = offRamps[i].offRamp;
            if (offRamps[i].sourceChainSelector != sourceSelector || ramp.code.length == 0) continue;
            listed = true;
            string memory version = _ccipTypeAndVersion(ramp);
            string memory status = "unknown type";
            if (vm.indexOf(version, "OffRamp") == 0) {
                bool enabled = _ccipSourceEnabled(ramp, router, sourceSelector);
                status = enabled ? "source enabled" : "source not enabled for this router";
                if (enabled) offRamp = ramp;
                else disabled = string.concat(disabled, " ", vm.toString(ramp), " (", version, ")");
            } else if (vm.indexOf(version, "EVM2EVMOffRamp ") == 0) {
                status = "legacy";
                legacy = ramp;
                legacyVersion = version;
            }
            console.log(string.concat("  listed off-ramp ", vm.toString(ramp), " ", version, " (", status, ")"));
        }
        if (offRamp != address(0)) return offRamp;
        require(
            bytes(disabled).length == 0,
            string.concat(
                "CCIP_REPORTER_CHAIN_SELECTOR ",
                vm.toString(sourceSelector),
                ": the router on chain ",
                vm.toString(block.chainid),
                " lists the OffRamp",
                disabled,
                " for it, but with the source disabled or bound to another router than CCIP_ADAPTER_ROUTER: the lane is on 1.6+ and not enabled here"
            )
        );
        if (legacy != address(0)) {
            console.log(
                string.concat(
                    "WARNING: only legacy off-ramps from ",
                    vm.toString(sourceSelector),
                    " on chain ",
                    vm.toString(block.chainid),
                    ": ",
                    vm.toString(legacy),
                    " ",
                    legacyVersion
                )
            );
            return legacy;
        }
        revert(
            string.concat(
                "CCIP_REPORTER_CHAIN_SELECTOR ",
                vm.toString(sourceSelector),
                ": the router on chain ",
                vm.toString(block.chainid),
                listed
                    ? " lists no enabled off-ramp from it (the listed ones are logged above)"
                    : " has no off-ramp from it"
            )
        );
    }

    /// @dev OffRamp 1.6+: getSourceChainConfig(source) returns a dynamic struct that starts (router, isEnabled).
    /// Read as plain words, so odd return data gives false instead of a decode revert.
    function _ccipSourceEnabled(address ramp, address router, uint64 sourceSelector) private view returns (bool) {
        (bool ok, bytes memory ret) = ramp.staticcall(
            abi.encodeWithSignature("getSourceChainConfig(uint64)", sourceSelector)
        );
        if (!ok || ret.length < 96) return false;
        (, uint256 configRouter, uint256 isEnabled) = abi.decode(ret, (uint256, uint256, uint256));
        return isEnabled == 1 && configRouter == uint256(uint160(router));
    }

    /// @dev Requires `ramp`'s own (local) chain selector to equal `expected`. OnRamp/OffRamp 1.6+ put it first in
    /// getStaticConfig(); EVM2EVMOnRamp/EVM2EVMOffRamp 1.2-1.5 put it second (after linkToken / commitStore). The 1.6+
    /// family is matched without the trailing space, so subclasses that keep its layout (OffRampOverSuperchainInterop,
    /// OnRampOverSuperchainInterop) pass too.
    function _ccipRequireLocalSelector(string memory key, uint64 expected, address ramp) private view {
        string memory version = _ccipTypeAndVersion(ramp);
        uint256 word;
        if (vm.indexOf(version, "OnRamp") == 0 || vm.indexOf(version, "OffRamp") == 0) {
            word = 0;
        } else if (vm.indexOf(version, "EVM2EVMOnRamp ") == 0 || vm.indexOf(version, "EVM2EVMOffRamp ") == 0) {
            word = 1;
        } else {
            revert(string.concat("CCIP ramp ", vm.toString(ramp), ": unknown type '", version, "'"));
        }
        (bool ok, bytes memory config) = ramp.staticcall(abi.encodeWithSignature("getStaticConfig()"));
        require(
            ok && config.length >= 32 * (word + 1),
            string.concat("CCIP ramp ", vm.toString(ramp), " ", version, ": no getStaticConfig()")
        );
        uint256 local;
        assembly {
            local := mload(add(add(config, 32), mul(word, 32)))
        }
        require(
            local == expected,
            string.concat(
                key,
                " ",
                vm.toString(expected),
                " is not chain ",
                vm.toString(block.chainid),
                "'s CCIP selector: its ",
                version,
                " ",
                vm.toString(ramp),
                " says ",
                vm.toString(local)
            )
        );
    }

    /// @dev The ramp's typeAndVersion(), or "" when it has none.
    function _ccipTypeAndVersion(address ramp) private view returns (string memory) {
        (bool ok, bytes memory ret) = ramp.staticcall(abi.encodeWithSignature("typeAndVersion()"));
        return ok && ret.length >= 64 ? abi.decode(ret, (string)) : "";
    }
}

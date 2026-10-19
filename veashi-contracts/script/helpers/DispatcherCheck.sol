// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IDispatchVoucher} from "../../src/interfaces/IDispatchVoucher.sol";
import {console} from "forge-std/console.sol";
import {DeploymentState} from "./DeploymentState.sol";

/// @dev Checks a reporter's dispatcher (the gateway, a VouchedDispatcher on the reporter chain) before it is set.
abstract contract DispatcherCheck is DeploymentState {
    /// @dev _dispatcherProblem for a getter-less dispatcher that is not DISPATCHER_ADDRESS: the scripts cannot prove
    /// its Yaho, because DISPATCHER_YAHO speaks only for DISPATCHER_ADDRESS.
    string internal constant DISPATCHER_UNPROVEN =
        "has no yaho() getter and is not DISPATCHER_ADDRESS: if it is the route's gateway, set DISPATCHER_ADDRESS to it and DISPATCHER_YAHO to the Yaho it dispatches through; otherwise point its reporters at the route's gateway";

    /// @dev Requires `dispatcher` to pass _dispatcherProblem: it answers isDispatching like a VouchedDispatcher (false
    /// outside a dispatch) and dispatches through `expectedYaho`, the Yaho every reporter of the route accepts calls
    /// from. VouchedDispatcher keeps its Yaho behind an internal `_yaho()`; the kleros-v2 gateways expose a public
    /// `yaho()`, and a gateway without one must be DISPATCHER_ADDRESS, with DISPATCHER_YAHO the operator's statement of
    /// the Yaho it dispatches through.
    function _checkDispatcher(address dispatcher, address expectedYaho) internal view {
        string memory problem = _dispatcherProblem(dispatcher, expectedYaho);
        require(
            bytes(problem).length == 0,
            string.concat(
                "dispatcher ",
                vm.toString(dispatcher),
                " ",
                problem,
                "; the reporters accept Yaho ",
                vm.toString(expectedYaho)
            )
        );
        (bool ok, bytes memory ret) = dispatcher.staticcall(abi.encodeWithSignature("yaho()"));
        if (ok && ret.length == 32) {
            console.log("dispatcher", dispatcher, "dispatches through Yaho", expectedYaho);
        } else {
            console.log("dispatcher has no yaho(); relying on DISPATCHER_YAHO", expectedYaho);
        }
    }

    /// @dev _checkDispatcher without reverting, for a dispatcher only the governor can change: why `dispatcher` fails
    /// the check, or "" when it passes.
    function _dispatcherProblem(address dispatcher, address expectedYaho) internal view returns (string memory) {
        if (dispatcher.code.length == 0) return string.concat("has no code on chain ", vm.toString(block.chainid));
        if (_is7702(dispatcher)) {
            return
                string.concat(
                    "is an EOA with an EIP-7702 delegation on chain ",
                    vm.toString(block.chainid),
                    ", not a contract"
                );
        }

        (bool ok, bytes memory ret) = dispatcher.staticcall(
            abi.encodeCall(IDispatchVoucher.isDispatching, (bytes32(0)))
        );
        if (!ok || ret.length != 32 || abi.decode(ret, (uint256)) != 0) {
            return "is not a VouchedDispatcher: isDispatching(0) must return false";
        }

        (ok, ret) = dispatcher.staticcall(abi.encodeWithSignature("yaho()"));
        if (ok && ret.length == 32) {
            uint256 word = abi.decode(ret, (uint256));
            if (word >> 160 != 0) return "returned malformed yaho() data";
            address yaho = address(uint160(word));
            return yaho == expectedYaho ? "" : string.concat("dispatches through Yaho ", vm.toString(yaho));
        }
        if (ok && ret.length != 0) return "returned malformed yaho() data";

        // DISPATCHER_YAHO states the Yaho of the DISPATCHER_ADDRESS gateway, not of any dispatcher a reporter holds.
        if (dispatcher != vm.envOr("DISPATCHER_ADDRESS", address(0))) return DISPATCHER_UNPROVEN;
        address stated = vm.envOr("DISPATCHER_YAHO", address(0));
        if (stated == address(0)) {
            return "has no yaho() getter: set DISPATCHER_YAHO to the Yaho it dispatches through";
        }
        if (stated == expectedYaho) return "";
        return
            string.concat(
                "has no yaho() getter and DISPATCHER_YAHO is ",
                vm.toString(stated),
                ", not the route's Yaho (correct DISPATCHER_YAHO if it is stale, or use a gateway on the route's Yaho)"
            );
    }

    /// @dev DISPATCHER_ADDRESS checked against `yaho`, or zero when unset (set it later with deploy-route.sh
    /// --set-dispatcher).
    function _optionalDispatcher(address yaho) internal view returns (address dispatcher) {
        dispatcher = vm.envOr("DISPATCHER_ADDRESS", address(0));
        if (dispatcher == address(0)) {
            console.log(
                "no DISPATCHER_ADDRESS: the reporter reverts DispatcherNotSet until deploy-route.sh --set-dispatcher"
            );
            return dispatcher;
        }
        _checkDispatcher(dispatcher, yaho);
    }
}

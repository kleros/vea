// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PaidReporter} from "../../src/adapters/PaidReporter.sol";
import {IAdapter} from "../../src/interfaces/IAdapter.sol";
import {console} from "forge-std/console.sol";
import {DeploymentState} from "./DeploymentState.sol";

/// @dev Funds a paid reporter after its route is configured. A reporter pays every bridge fee from its own balance,
/// and Yaho calls every reporter in one transaction, so an unfunded reporter reverts each dispatch that lists it.
abstract contract ReporterFunding is DeploymentState {
    /// @dev `<BRIDGE>_REPORTER_FUNDING`: the balance, in wei of the reporter chain's native token, to top the reporter
    /// up to; 0 skips funding. Required, so a missing value never silently leaves a reporter unfunded.
    function _requiredFunding(string memory key) internal view returns (uint256) {
        require(
            _envSet(key),
            string.concat(
                key,
                " is unset: set the target balance in wei (the step tops the reporter up to it), or 0 to skip funding"
            )
        );
        return vm.envUint(key);
    }

    /// @dev What one dispatch to `targetChainId` costs now. A revert means the route is misconfigured (unset chain
    /// map, unsupported lane, wrong DVN), so it stops the script even when funding is 0.
    function _quote(
        PaidReporter reporter,
        uint256 targetChainId,
        address adapter,
        string memory bridge
    ) internal view returns (address token, uint256 amount) {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = bytes32(uint256(1));
        try reporter.quoteDispatch(targetChainId, IAdapter(adapter), ids, hashes) returns (address t, uint256 a) {
            return (t, a);
        } catch (bytes memory err) {
            revert(
                string.concat(
                    bridge,
                    " quoteDispatch reverted, the route is misconfigured: ",
                    err.length == 0
                        ? "empty revert data, so a configured bridge address is likely not the contract it should be (lz: check LZ_EXECUTOR and the DVNs in layerzero.json)"
                        : string.concat(vm.toString(err), " (decode with: cast decode-error <data>)")
                )
            );
        }
    }

    /// @dev Tops `reporter` up to `funding` native wei in its own broadcast, so rerunning ConfigureLZReporter never
    /// funds the LayerZero reporter twice. A CCIP, deBridge or Axelar deploy step that fails after this transfer
    /// leaves the funding in a reporter the route file does not record, and its rerun funds the new reporter (README,
    /// Recovery: withdrawNative to the keeper). Refuses native funding when the reporter pays fees in an ERC20
    /// (`token` from `_quote`: a CCIP fee token, or a LayerZero EndpointV2Alt native token).
    function _fund(
        uint256 pk,
        PaidReporter reporter,
        address token,
        uint256 quote,
        uint256 funding,
        string memory key
    ) internal {
        if (token != address(0)) {
            require(
                funding == 0,
                string.concat(
                    key,
                    ": the reporter pays fees in ERC20 ",
                    vm.toString(token),
                    "; native funding refused. Set it to 0 and transfer the token"
                )
            );
            uint256 tokenBalance = IERC20(token).balanceOf(address(reporter));
            console.log("fee token", token);
            console.log("fee token balance / one dispatch quote:", tokenBalance, quote);
            if (tokenBalance < quote) console.log("WARNING: transfer the fee token before the first dispatch");
            return;
        }

        uint256 topUp = funding > address(reporter).balance ? funding - address(reporter).balance : 0;
        if (topUp > 0) {
            vm.startBroadcast(pk);
            (bool sent, ) = address(reporter).call{value: topUp}("");
            require(sent, string.concat(key, ": funding transfer failed"));
            vm.stopBroadcast();
        } else if (funding == 0) {
            console.log("WARNING:", key, "is 0: the reporter is not funded");
        }

        uint256 balance = address(reporter).balance;
        console.log("reporter balance / one dispatch quote (wei):", balance, quote);
        if (balance < quote) {
            console.log("WARNING: the reporter cannot pay one dispatch; every Yaho dispatch that lists it reverts");
        }
    }
}

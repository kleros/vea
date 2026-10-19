// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DeploymentState} from "../helpers/DeploymentState.sol";

/// @dev The Vea route's env inputs. VEA_INBOX and VEA_OUTBOX must be the two ends of one Vea route from
/// REPORTER_CHAIN_ID to ADAPTER_CHAIN_ID; the chain ids themselves come from REPORTER_CHAIN_ID and ADAPTER_CHAIN_ID.
/// The Env functions read only the keys HandOver compares and call no Vea contract.
abstract contract VeaInputs is DeploymentState {
    struct VeaReporterInputs {
        address inbox;
    }

    struct VeaAdapterInputs {
        address outbox;
    }

    /// @dev The reporter side's env: the inbox has code.
    function _veaReporterEnv() internal view returns (VeaReporterInputs memory inputs) {
        inputs.inbox = _envAddressRequired("VEA_INBOX");
        _requireCode("VEA_INBOX", inputs.inbox);
    }

    /// @dev Reporter chain: the env, and an ArbToEth inbox must name VEA_OUTBOX as its outbox. Also requires the
    /// adapter side's VEA_OUTBOX, so a preflight on the reporter chain catches a missing key before the first
    /// broadcast.
    function _veaReporterInputs() internal view returns (VeaReporterInputs memory inputs) {
        inputs = _veaReporterEnv();
        address outbox = _envAddressRequired("VEA_OUTBOX");
        // Only an ArbToEth inbox has veaOutboxArbToEth(); deploy-route.sh pairs the others across both chains.
        (bool ok, bytes memory ret) = inputs.inbox.staticcall(abi.encodeWithSignature("veaOutboxArbToEth()"));
        if (ok && ret.length == 32) {
            address named = abi.decode(ret, (address));
            require(
                named == outbox,
                string.concat(
                    "VEA_INBOX is an ArbToEth inbox for outbox ",
                    vm.toString(named),
                    ", not VEA_OUTBOX ",
                    vm.toString(outbox)
                )
            );
        }
    }

    /// @dev The adapter side's env: the outbox has code.
    function _veaAdapterEnv() internal view returns (VeaAdapterInputs memory inputs) {
        inputs.outbox = _envAddressRequired("VEA_OUTBOX");
        _requireCode("VEA_OUTBOX", inputs.outbox);
    }

    /// @dev Adapter chain: the env only (the outbox does not name its inbox; deploy-route.sh pairs them).
    function _veaAdapterInputs() internal view returns (VeaAdapterInputs memory inputs) {
        inputs = _veaAdapterEnv();
    }
}

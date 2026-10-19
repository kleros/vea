// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console} from "forge-std/console.sol";
import {IMessageLibManager, SetConfigParam} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {ExecutorConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";
import {ILZEndpointViews, IUlnLibViews} from "./BridgeViews.sol";
import {DeploymentState} from "./DeploymentState.sol";

/// @dev SendLibBase's raw executor config of an OApp (getExecutorConfig merges in the defaults).
interface ILZSendLibExecutorViews {
    function executorConfigs(address oapp, uint32 eid) external view returns (uint32 maxMessageSize, address executor);
}

/// @dev The endpoint's raw default libraries (zero when the pathway has none; the getters revert instead).
interface ILZLibDefaultsViews {
    function defaultSendLibrary(uint32 eid) external view returns (address);

    function defaultReceiveLibrary(uint32 eid) external view returns (address);
}

/// @dev The LayerZero DVN policy from script/config/layerzero.json, and the endpoint calls that apply and check it.
/// Each OApp gets its own fixed config: pinned libraries, the required DVNs the file names, no optional DVNs.
/// Nothing falls back to the endpoint defaults, which are LayerZero's dead DVN on many pathways.
abstract contract LayerZeroConfig is DeploymentState {
    uint32 internal constant LZ_EXECUTOR_CONFIG_TYPE = 1;
    uint32 internal constant LZ_ULN_CONFIG_TYPE = 2;
    /// @dev ULN's NIL count: "no optional DVNs". 0 would mean "inherit the default optional DVNs".
    uint8 internal constant LZ_NIL_DVN_COUNT = type(uint8).max;
    /// @dev ULN's limit on DVNs per list.
    uint256 private constant LZ_MAX_DVNS = 127;

    /*//////////////////////////////////////////////////////////////
                                READ THE FILE
    //////////////////////////////////////////////////////////////*/

    function _lzConfigJson() internal view returns (string memory) {
        return vm.readFile(string.concat(vm.projectRoot(), "/script/config/layerzero.json"));
    }

    /// @dev The top-level fields: the required DVN providers (nonempty, unique, at most 127) and maxMessageSize.
    function _parseLz(string memory json) internal view returns (string[] memory providers, uint32 maxMessageSize) {
        require(vm.keyExistsJson(json, ".requiredDVNs"), "layerzero.json: requiredDVNs missing");
        providers = vm.parseJsonStringArray(json, ".requiredDVNs");
        require(providers.length > 0, "layerzero.json: requiredDVNs is empty");
        require(providers.length <= LZ_MAX_DVNS, "layerzero.json: requiredDVNs lists more than 127 providers");
        for (uint256 i = 0; i < providers.length; i++) {
            require(bytes(providers[i]).length > 0, "layerzero.json: requiredDVNs has an empty name");
            for (uint256 j = 0; j < i; j++) {
                require(
                    keccak256(bytes(providers[i])) != keccak256(bytes(providers[j])),
                    string.concat("layerzero.json: requiredDVNs lists ", providers[i], " twice")
                );
            }
        }

        require(vm.keyExistsJson(json, ".maxMessageSize"), "layerzero.json: maxMessageSize missing");
        uint256 size = vm.parseJsonUint(json, ".maxMessageSize");
        require(size > 0 && size <= type(uint32).max, "layerzero.json: maxMessageSize must be a nonzero uint32");
        maxMessageSize = uint32(size);
    }

    /// @dev The JSON path of `eid`'s entry, which must exist.
    function _lzChain(string memory json, uint32 eid) internal view returns (string memory key) {
        key = string.concat(".chains['", vm.toString(eid), "']");
        require(vm.keyExistsJson(json, key), string.concat("layerzero.json: eid ", vm.toString(eid), " missing"));
    }

    function _lzChainId(string memory json, uint32 eid) internal view returns (uint256 chainId) {
        string memory key = string.concat(_lzChain(json, eid), ".chainId");
        require(
            vm.keyExistsJson(json, key),
            string.concat("layerzero.json: chainId missing for eid ", vm.toString(eid))
        );
        chainId = vm.parseJsonUint(json, key);
    }

    /// @dev `eid`'s confirmations: how many blocks DVNs wait on that chain before they verify a message sent from it.
    function _lzConfirmations(string memory json, uint32 eid) internal view returns (uint64) {
        string memory key = string.concat(_lzChain(json, eid), ".confirmations");
        require(
            vm.keyExistsJson(json, key),
            string.concat("layerzero.json: confirmations missing for eid ", vm.toString(eid))
        );
        uint256 confirmations = vm.parseJsonUint(json, key);
        // 0 means "use the default" and uint64.max means "none" to ULN; neither is a fixed policy.
        require(
            confirmations > 0 && confirmations < type(uint64).max,
            string.concat("layerzero.json: confirmations for eid ", vm.toString(eid), " must be in 1..2^64-2")
        );
        return uint64(confirmations);
    }

    /// @dev The required DVNs of `eid`'s entry: one per provider, nonzero, unique, sorted ascending as ULN requires.
    function _lzDvns(string memory json, uint32 eid) internal view returns (address[] memory dvns) {
        (string[] memory providers, ) = _parseLz(json);
        string memory chain = _lzChain(json, eid);
        dvns = new address[](providers.length);
        for (uint256 i = 0; i < providers.length; i++) {
            string memory key = string.concat(chain, ".dvns['", providers[i], "']");
            require(
                vm.keyExistsJson(json, key),
                string.concat("layerzero.json: provider ", providers[i], " missing for eid ", vm.toString(eid))
            );
            address dvn = vm.parseJsonAddress(json, key);
            require(
                dvn != address(0),
                string.concat("layerzero.json: provider ", providers[i], " is zero for eid ", vm.toString(eid))
            );
            // Insertion sort; an equal address is a duplicate.
            uint256 j = i;
            while (j > 0 && dvns[j - 1] > dvn) {
                dvns[j] = dvns[j - 1];
                j--;
            }
            require(
                j == 0 || dvns[j - 1] != dvn,
                string.concat("layerzero.json: DVN ", vm.toString(dvn), " listed twice for eid ", vm.toString(eid))
            );
            dvns[j] = dvn;
        }
    }

    /// @dev The ULN config an OApp on `localEid` sets for the pathway whose messages start on `sourceEid`: the local
    /// chain's DVN contracts, the source chain's confirmations (so both ends of a pathway agree), no optional DVNs.
    function _buildUln(
        string memory json,
        uint32 localEid,
        uint32 sourceEid
    ) internal view returns (UlnConfig memory uln) {
        address[] memory dvns = _lzDvns(json, localEid);
        uln = UlnConfig({
            confirmations: _lzConfirmations(json, sourceEid),
            requiredDVNCount: uint8(dvns.length),
            optionalDVNCount: LZ_NIL_DVN_COUNT,
            optionalDVNThreshold: 0,
            requiredDVNs: dvns,
            optionalDVNs: new address[](0)
        });
    }

    /// @dev The file describes this chain and endpoint as `localEid`, and `remoteEid` as `remoteChainId`. Every DVN
    /// the local side uses has code here.
    function _requireLzRoute(
        string memory json,
        uint32 localEid,
        uint32 remoteEid,
        address endpoint,
        uint256 remoteChainId
    ) internal view {
        require(localEid != remoteEid, "LZ_REPORTER_EID and LZ_ADAPTER_EID must differ");
        uint256 localChainId = _lzChainId(json, localEid);
        require(
            localChainId == block.chainid,
            string.concat(
                "layerzero.json: eid ",
                vm.toString(localEid),
                " is chain ",
                vm.toString(localChainId),
                " but the RPC is chain ",
                vm.toString(block.chainid)
            )
        );
        uint32 endpointEid = ILZEndpointViews(endpoint).eid();
        require(
            endpointEid == localEid,
            string.concat(
                "LayerZero endpoint ",
                vm.toString(endpoint),
                " has eid ",
                vm.toString(endpointEid),
                ", expected ",
                vm.toString(localEid)
            )
        );
        uint256 remoteId = _lzChainId(json, remoteEid);
        require(
            remoteId == remoteChainId,
            string.concat(
                "layerzero.json: eid ",
                vm.toString(remoteEid),
                " is chain ",
                vm.toString(remoteId),
                ", the route expects chain ",
                vm.toString(remoteChainId)
            )
        );
        address[] memory dvns = _lzDvns(json, localEid);
        for (uint256 i = 0; i < dvns.length; i++) {
            _requireCode(string.concat("DVN for eid ", vm.toString(localEid)), dvns[i]);
        }
    }

    /*//////////////////////////////////////////////////////////////
                        APPLY (inside a broadcast)
    //////////////////////////////////////////////////////////////*/

    /// @dev Pins `oapp`'s send library for `dstEid` to `lib`, so a later change of the endpoint default cannot move
    /// it to a library without this config. Skips when it is already pinned there (a repeat reverts LZ_SameValue).
    function _pinSendLib(address endpoint, address oapp, uint32 dstEid, address lib) internal {
        ILZEndpointViews views = ILZEndpointViews(endpoint);
        bool isDefault = views.isDefaultSendLibrary(oapp, dstEid);
        if (!isDefault && views.getSendLibrary(oapp, dstEid) == lib) {
            console.log("send library already pinned:", lib);
            return;
        }
        if (isDefault) _lzWarnIfNotDefault("send", ILZLibDefaultsViews(endpoint).defaultSendLibrary(dstEid), lib);
        IMessageLibManager(endpoint).setSendLibrary(oapp, dstEid, lib);
    }

    /// @dev Pins `oapp`'s receive library for `srcEid` to `lib`, with no grace period for the old one (a grace
    /// period from the default library reverts LZ_OnlyNonDefaultLib). Skips when it is already pinned there.
    function _pinReceiveLib(address endpoint, address oapp, uint32 srcEid, address lib) internal {
        (address current, bool isDefault) = _lzReceiveLibrary(endpoint, oapp, srcEid);
        if (!isDefault && current == lib) {
            console.log("receive library already pinned:", lib);
            return;
        }
        if (isDefault) _lzWarnIfNotDefault("receive", current, lib);
        IMessageLibManager(endpoint).setReceiveLibrary(oapp, srcEid, lib, 0);
    }

    /// @dev getReceiveLibrary, except that an OApp on the default library of a pathway with no endpoint default
    /// returns (0, true) instead of reverting LZ_DefaultReceiveLibUnavailable. The endpoint keeps the OApp's own
    /// entry internal, so this is the only way to read it.
    function _lzReceiveLibrary(
        address endpoint,
        address oapp,
        uint32 srcEid
    ) internal view returns (address lib, bool isDefault) {
        if (ILZLibDefaultsViews(endpoint).defaultReceiveLibrary(srcEid) != address(0)) {
            return ILZEndpointViews(endpoint).getReceiveLibrary(oapp, srcEid);
        }
        // With no default, getReceiveLibrary reverts exactly when the OApp is on the default.
        try ILZEndpointViews(endpoint).getReceiveLibrary(oapp, srcEid) returns (address current, bool onDefault) {
            return (current, onDefault);
        } catch {
            return (address(0), true);
        }
    }

    function _lzWarnIfNotDefault(string memory side, address defaultLib, address lib) private pure {
        if (defaultLib == address(0)) {
            console.log(string.concat("pinning the ", side, " library to"), lib);
            console.log("  the endpoint has no default for this pathway");
        } else if (defaultLib != lib) {
            console.log(string.concat("WARNING: pinning the ", side, " library to"), lib);
            console.log("  the endpoint default for this pathway is", defaultLib);
        }
    }

    /// @dev The send side's SetConfigParams: the executor (it pays lzReceive gas on the other chain) and the ULN.
    function _lzSendParams(
        uint32 dstEid,
        address executor,
        uint32 maxMessageSize,
        UlnConfig memory uln
    ) internal pure returns (SetConfigParam[] memory params) {
        params = new SetConfigParam[](2);
        params[0] = SetConfigParam(
            dstEid,
            LZ_EXECUTOR_CONFIG_TYPE,
            abi.encode(ExecutorConfig({maxMessageSize: maxMessageSize, executor: executor}))
        );
        params[1] = SetConfigParam(dstEid, LZ_ULN_CONFIG_TYPE, abi.encode(uln));
    }

    function _lzReceiveParams(
        uint32 srcEid,
        UlnConfig memory uln
    ) internal pure returns (SetConfigParam[] memory params) {
        params = new SetConfigParam[](1);
        params[0] = SetConfigParam(srcEid, LZ_ULN_CONFIG_TYPE, abi.encode(uln));
    }

    /// @dev True when `oapp`'s own config in `lib` already equals `uln` (and, for a send library, the executor
    /// config), so a rerun can skip setConfig.
    function _lzConfigMatches(
        address oapp,
        address lib,
        uint32 eid,
        UlnConfig memory uln,
        bool sendSide,
        address executor,
        uint32 maxMessageSize
    ) internal view returns (bool) {
        if (!_lzUlnEqual(IUlnLibViews(lib).getAppUlnConfig(oapp, eid), uln)) return false;
        if (!sendSide) return true;
        (uint32 size, address exec) = ILZSendLibExecutorViews(lib).executorConfigs(oapp, eid);
        return size == maxMessageSize && exec == executor;
    }

    /*//////////////////////////////////////////////////////////////
                        VERIFY (after stopBroadcast)
    //////////////////////////////////////////////////////////////*/

    /// @dev Reverts, naming the side, eid and field, unless the endpoint resolves `oapp`'s pathway to exactly the
    /// intended config: the pinned library, the required DVNs, no optional DVNs and, on the send side, the executor
    /// and maxMessageSize. Read only; call it after vm.stopBroadcast().
    function _verifyLz(
        address endpoint,
        address oapp,
        address lib,
        uint32 eid,
        UlnConfig memory intended,
        bool sendSide,
        address executor,
        uint32 maxMessageSize
    ) internal view {
        ILZEndpointViews views = ILZEndpointViews(endpoint);
        string memory where = string.concat(
            sendSide ? "LZ send side, eid " : "LZ receive side, eid ",
            vm.toString(eid)
        );

        // (a) The library the endpoint uses is the pinned one.
        if (sendSide) {
            require(
                !views.isDefaultSendLibrary(oapp, eid) && views.getSendLibrary(oapp, eid) == lib,
                string.concat(where, ": send library is not pinned to ", vm.toString(lib))
            );
        } else {
            (address current, bool isDefault) = _lzReceiveLibrary(endpoint, oapp, eid);
            require(
                current == lib && !isDefault,
                string.concat(where, ": receive library is not pinned to ", vm.toString(lib))
            );
        }

        // (b) The resolved config: NIL optional resolves to an empty optional set.
        UlnConfig memory resolved = abi.decode(views.getConfig(oapp, lib, eid, LZ_ULN_CONFIG_TYPE), (UlnConfig));
        require(resolved.confirmations == intended.confirmations, string.concat(where, ": confirmations differ"));
        require(
            resolved.requiredDVNCount == intended.requiredDVNCount,
            string.concat(where, ": requiredDVNCount differs")
        );
        require(
            _lzAddressesEqual(resolved.requiredDVNs, intended.requiredDVNs),
            string.concat(where, ": requiredDVNs differ")
        );
        require(
            resolved.optionalDVNCount == 0 && resolved.optionalDVNThreshold == 0 && resolved.optionalDVNs.length == 0,
            string.concat(where, ": optional DVNs are set")
        );

        // (c) The OApp's own config, so nothing comes from the defaults.
        require(
            _lzUlnEqual(IUlnLibViews(lib).getAppUlnConfig(oapp, eid), intended),
            string.concat(where, ": the OApp's own ULN config differs from layerzero.json")
        );

        // (d) The executor that is paid to deliver.
        if (sendSide) {
            ExecutorConfig memory exec = abi.decode(
                views.getConfig(oapp, lib, eid, LZ_EXECUTOR_CONFIG_TYPE),
                (ExecutorConfig)
            );
            require(exec.executor == executor, string.concat(where, ": executor is not LZ_EXECUTOR"));
            require(exec.maxMessageSize == maxMessageSize, string.concat(where, ": maxMessageSize differs"));
        }

        // (e) LayerZero's default for the pathway, for comparison (the default config lives under address(0)).
        uint64 defaultConfirmations = IUlnLibViews(lib).getAppUlnConfig(address(0), eid).confirmations;
        console.log(string.concat(where, ": library"), lib);
        console.log("  confirmations, LayerZero default:", intended.confirmations, defaultConfirmations);
        for (uint256 i = 0; i < intended.requiredDVNs.length; i++) {
            console.log("  required DVN", intended.requiredDVNs[i]);
        }
        if (intended.confirmations < defaultConfirmations) {
            console.log("WARNING: confirmations are below LayerZero's default for this pathway");
        }
    }

    function _lzUlnEqual(UlnConfig memory a, UlnConfig memory b) private pure returns (bool) {
        return
            a.confirmations == b.confirmations &&
            a.requiredDVNCount == b.requiredDVNCount &&
            a.optionalDVNCount == b.optionalDVNCount &&
            a.optionalDVNThreshold == b.optionalDVNThreshold &&
            _lzAddressesEqual(a.requiredDVNs, b.requiredDVNs) &&
            _lzAddressesEqual(a.optionalDVNs, b.optionalDVNs);
    }

    function _lzAddressesEqual(address[] memory a, address[] memory b) private pure returns (bool) {
        if (a.length != b.length) return false;
        for (uint256 i = 0; i < a.length; i++) {
            if (a[i] != b[i]) return false;
        }
        return true;
    }
}

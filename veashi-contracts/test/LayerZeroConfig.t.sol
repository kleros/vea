// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {EndpointV2} from "@layerzerolabs/lz-evm-protocol-v2/contracts/EndpointV2.sol";
import {IMessageLib, MessageLibType} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLib.sol";
import {SetConfigParam} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import {ILZEndpointViews} from "../script/helpers/BridgeViews.sol";
import {LayerZeroConfig} from "../script/helpers/LayerZeroConfig.sol";

/// @dev Exposes the script helper's internal functions.
contract LayerZeroConfigHarness is LayerZeroConfig {
    function configJson() external view returns (string memory) {
        return _lzConfigJson();
    }

    function parse(string memory json) external view returns (string[] memory, uint32) {
        return _parseLz(json);
    }

    function confirmations(string memory json, uint32 eid) external view returns (uint64) {
        return _lzConfirmations(json, eid);
    }

    function dvns(string memory json, uint32 eid) external view returns (address[] memory) {
        return _lzDvns(json, eid);
    }

    function buildUln(string memory json, uint32 localEid, uint32 sourceEid) external view returns (UlnConfig memory) {
        return _buildUln(json, localEid, sourceEid);
    }

    function requireRoute(
        string memory json,
        uint32 localEid,
        uint32 remoteEid,
        address endpoint,
        uint256 remoteChainId
    ) external view {
        _requireLzRoute(json, localEid, remoteEid, endpoint, remoteChainId);
    }

    /// @dev The harness is its own OApp, so the endpoint authorizes it.
    function pinSendLib(address endpoint, uint32 dstEid, address lib) external {
        _pinSendLib(endpoint, address(this), dstEid, lib);
    }

    function pinReceiveLib(address endpoint, uint32 srcEid, address lib) external {
        _pinReceiveLib(endpoint, address(this), srcEid, lib);
    }

    function receiveLibrary(address endpoint, uint32 srcEid) external view returns (address, bool) {
        return _lzReceiveLibrary(endpoint, address(this), srcEid);
    }
}

/// @dev A registrable message library that serves every eid and stores nothing.
contract MockMessageLib is IMessageLib {
    MessageLibType internal immutable libType;

    constructor(MessageLibType _libType) {
        libType = _libType;
    }

    function setConfig(address, SetConfigParam[] calldata) external {}

    function getConfig(uint32, address, uint32) external pure returns (bytes memory) {
        return "";
    }

    function isSupportedEid(uint32) external pure returns (bool) {
        return true;
    }

    function version() external pure returns (uint64, uint8, uint8) {
        return (3, 0, 2);
    }

    function messageLibType() external view returns (MessageLibType) {
        return libType;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IMessageLib).interfaceId;
    }
}

/// @notice script/config/layerzero.json is complete and consistent, and the helper rejects a broken file.
contract LayerZeroConfigTest is Test {
    uint8 internal constant NIL = type(uint8).max;
    address internal constant DVN_A = address(0xA1);
    address internal constant DVN_B = address(0xB2);

    LayerZeroConfigHarness internal helper;
    string internal json;

    function setUp() public {
        // DeploymentState reads the route's chain ids when it is constructed.
        vm.setEnv("REPORTER_CHAIN_ID", "1");
        vm.setEnv("ADAPTER_CHAIN_ID", "2");
        helper = new LayerZeroConfigHarness();
        json = helper.configJson();
    }

    /*//////////////////////////////////////////////////////////////
                            THE CHECKED-IN FILE
    //////////////////////////////////////////////////////////////*/

    function test_TopLevel() public view {
        (string[] memory providers, uint32 maxMessageSize) = helper.parse(json);
        assertGt(providers.length, 0);
        assertLe(providers.length, 127);
        for (uint256 i = 0; i < providers.length; i++) {
            for (uint256 j = 0; j < i; j++) assertNotEq(providers[i], providers[j]);
        }
        assertGt(maxMessageSize, 0);
    }

    function test_EveryChain() public view {
        string[] memory eids = vm.parseJsonKeys(json, ".chains");
        assertGt(eids.length, 0);
        uint256[] memory chainIds = new uint256[](eids.length);
        for (uint256 i = 0; i < eids.length; i++) {
            uint256 eid = vm.parseUint(eids[i]);
            assertGt(eid, 0, eids[i]);
            assertLe(eid, type(uint32).max, eids[i]);
            string memory chain = string.concat(".chains['", eids[i], "']");
            assertGt(bytes(vm.parseJsonString(json, string.concat(chain, ".name"))).length, 0, eids[i]);

            chainIds[i] = vm.parseJsonUint(json, string.concat(chain, ".chainId"));
            assertGt(chainIds[i], 0, eids[i]);
            for (uint256 j = 0; j < i; j++) assertNotEq(chainIds[i], chainIds[j], "chainId listed twice");

            uint64 confirmations = helper.confirmations(json, uint32(eid));
            assertGt(confirmations, 0);
            assertLt(confirmations, type(uint64).max);

            // Every required provider is present, nonzero and unique (the helper reverts otherwise).
            helper.dvns(json, uint32(eid));
            _checkAllDvns(json, chain, eids[i]);
        }
    }

    function test_EveryOrderedPair() public view {
        string[] memory eids = vm.parseJsonKeys(json, ".chains");
        for (uint256 i = 0; i < eids.length; i++) {
            uint32 source = uint32(vm.parseUint(eids[i]));
            for (uint256 j = 0; j < eids.length; j++) {
                if (i == j) continue;
                uint32 destination = uint32(vm.parseUint(eids[j]));
                UlnConfig memory send = helper.buildUln(json, source, source);
                UlnConfig memory receive_ = helper.buildUln(json, destination, source);

                assertEq(send.requiredDVNCount, receive_.requiredDVNCount);
                assertEq(send.requiredDVNCount, send.requiredDVNs.length);
                assertEq(receive_.requiredDVNCount, receive_.requiredDVNs.length);
                _assertAscending(send.requiredDVNs);
                _assertAscending(receive_.requiredDVNs);

                uint64 sourceConfirmations = helper.confirmations(json, source);
                assertEq(send.confirmations, sourceConfirmations);
                assertEq(receive_.confirmations, sourceConfirmations);

                _assertNoOptional(send);
                _assertNoOptional(receive_);
            }
        }
    }

    function test_ChainIdGuard() public {
        address endpoint = makeAddr("endpoint");
        vm.mockCall(endpoint, abi.encodeWithSelector(ILZEndpointViews.eid.selector), abi.encode(uint32(30110)));
        address[] memory local = helper.dvns(json, 30110);
        for (uint256 i = 0; i < local.length; i++) vm.etch(local[i], hex"00");

        vm.chainId(42161);
        helper.requireRoute(json, 30110, 30364, endpoint, 1514);

        vm.expectRevert(bytes("layerzero.json: eid 30364 is chain 1514, the route expects chain 1"));
        helper.requireRoute(json, 30110, 30364, endpoint, 1);

        vm.chainId(1);
        vm.expectRevert(bytes("layerzero.json: eid 30110 is chain 42161 but the RPC is chain 1"));
        helper.requireRoute(json, 30110, 30364, endpoint, 1514);
    }

    function test_EndpointEidGuard() public {
        address endpoint = makeAddr("endpoint");
        vm.mockCall(endpoint, abi.encodeWithSelector(ILZEndpointViews.eid.selector), abi.encode(uint32(30101)));
        vm.chainId(42161);
        vm.expectRevert(
            bytes(string.concat("LayerZero endpoint ", vm.toString(endpoint), " has eid 30101, expected 30110"))
        );
        helper.requireRoute(json, 30110, 30364, endpoint, 1514);
    }

    function test_DvnWithoutCode() public {
        address endpoint = makeAddr("endpoint");
        vm.mockCall(endpoint, abi.encodeWithSelector(ILZEndpointViews.eid.selector), abi.encode(uint32(30110)));
        vm.chainId(42161);
        address dvn = helper.dvns(json, 30110)[0];
        vm.expectRevert(bytes(string.concat("DVN for eid 30110 ", vm.toString(dvn), " has no code on chain 42161")));
        helper.requireRoute(json, 30110, 30364, endpoint, 1514);
    }

    /*//////////////////////////////////////////////////////////////
                            A BROKEN FILE
    //////////////////////////////////////////////////////////////*/

    function test_RejectsMissingProvider() public {
        string memory broken = _file('["layerzero-labs","nethermind"]', "5", _dvns(DVN_A));
        vm.expectRevert(bytes("layerzero.json: provider nethermind missing for eid 1"));
        helper.buildUln(broken, 1, 1);
    }

    function test_RejectsZeroConfirmations() public {
        string memory broken = _file('["layerzero-labs"]', "0", _dvns(DVN_A));
        vm.expectRevert(bytes("layerzero.json: confirmations for eid 1 must be in 1..2^64-2"));
        helper.buildUln(broken, 1, 1);
    }

    function test_RejectsNilConfirmations() public {
        string memory broken = _file('["layerzero-labs"]', "18446744073709551615", _dvns(DVN_A));
        vm.expectRevert(bytes("layerzero.json: confirmations for eid 1 must be in 1..2^64-2"));
        helper.buildUln(broken, 1, 1);
    }

    function test_RejectsEmptyRequiredDVNs() public {
        string memory broken = _file("[]", "5", _dvns(DVN_A));
        vm.expectRevert(bytes("layerzero.json: requiredDVNs is empty"));
        helper.parse(broken);
    }

    function test_RejectsUnknownEid() public {
        string memory broken = _file('["layerzero-labs"]', "5", _dvns(DVN_A));
        vm.expectRevert(bytes("layerzero.json: eid 2 missing"));
        helper.buildUln(broken, 2, 1);
    }

    function test_RejectsZeroAddress() public {
        string memory broken = _file('["layerzero-labs"]', "5", _dvns(address(0)));
        vm.expectRevert(bytes("layerzero.json: provider layerzero-labs is zero for eid 1"));
        helper.buildUln(broken, 1, 1);
    }

    function test_RejectsDuplicateAddress() public {
        string memory dvnsJson = string.concat(
            '{"layerzero-labs":"',
            vm.toString(DVN_A),
            '","nethermind":"',
            vm.toString(DVN_A),
            '"}'
        );
        string memory broken = _file('["layerzero-labs","nethermind"]', "5", dvnsJson);
        vm.expectRevert(bytes(string.concat("layerzero.json: DVN ", vm.toString(DVN_A), " listed twice for eid 1")));
        helper.buildUln(broken, 1, 1);
    }

    function test_SortsDvns() public view {
        string memory dvnsJson = string.concat(
            '{"layerzero-labs":"',
            vm.toString(DVN_B),
            '","nethermind":"',
            vm.toString(DVN_A),
            '"}'
        );
        UlnConfig memory uln = helper.buildUln(_file('["layerzero-labs","nethermind"]', "5", dvnsJson), 1, 1);
        assertEq(uln.requiredDVNs[0], DVN_A);
        assertEq(uln.requiredDVNs[1], DVN_B);
        assertEq(uln.requiredDVNCount, 2);
        _assertNoOptional(uln);
    }

    /*//////////////////////////////////////////////////////////////
                    PINNING WITHOUT AN ENDPOINT DEFAULT
    //////////////////////////////////////////////////////////////*/

    /// @dev A registered library that serves the eid can be pinned although the endpoint has no default for it
    /// (getSendLibrary / getReceiveLibrary revert on such a pathway while the OApp is on the default).
    function test_PinsWithoutEndpointDefault() public {
        EndpointV2 endpoint = new EndpointV2(30101, address(this));
        MockMessageLib sendLib = new MockMessageLib(MessageLibType.Send);
        MockMessageLib receiveLib = new MockMessageLib(MessageLibType.Receive);
        endpoint.registerLibrary(address(sendLib));
        endpoint.registerLibrary(address(receiveLib));
        uint32 remoteEid = 30110;
        assertEq(endpoint.defaultSendLibrary(remoteEid), address(0));
        assertEq(endpoint.defaultReceiveLibrary(remoteEid), address(0));

        (address current, bool isDefault) = helper.receiveLibrary(address(endpoint), remoteEid);
        assertEq(current, address(0));
        assertTrue(isDefault);

        helper.pinSendLib(address(endpoint), remoteEid, address(sendLib));
        helper.pinReceiveLib(address(endpoint), remoteEid, address(receiveLib));
        assertEq(endpoint.getSendLibrary(address(helper), remoteEid), address(sendLib));
        assertFalse(endpoint.isDefaultSendLibrary(address(helper), remoteEid));
        (current, isDefault) = helper.receiveLibrary(address(endpoint), remoteEid);
        assertEq(current, address(receiveLib));
        assertFalse(isDefault);

        // A rerun skips (a second setSendLibrary / setReceiveLibrary would revert LZ_SameValue).
        helper.pinSendLib(address(endpoint), remoteEid, address(sendLib));
        helper.pinReceiveLib(address(endpoint), remoteEid, address(receiveLib));
    }

    /// @dev With an endpoint default, the OApp's entry still reads through to it.
    function test_ReceiveLibraryWithEndpointDefault() public {
        EndpointV2 endpoint = new EndpointV2(30101, address(this));
        MockMessageLib receiveLib = new MockMessageLib(MessageLibType.Receive);
        endpoint.registerLibrary(address(receiveLib));
        endpoint.setDefaultReceiveLibrary(30110, address(receiveLib), 0);
        (address current, bool isDefault) = helper.receiveLibrary(address(endpoint), 30110);
        assertEq(current, address(receiveLib));
        assertTrue(isDefault);
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @dev Every DVN address of an entry (not only the required ones) is EIP-55 checksummed and unique.
    function _checkAllDvns(string memory file, string memory chain, string memory eid) internal pure {
        string memory dvnsKey = string.concat(chain, ".dvns");
        string[] memory providers = vm.parseJsonKeys(file, dvnsKey);
        address[] memory seen = new address[](providers.length);
        for (uint256 i = 0; i < providers.length; i++) {
            string memory key = string.concat(dvnsKey, "['", providers[i], "']");
            string memory raw = vm.parseJsonString(file, key);
            seen[i] = vm.parseJsonAddress(file, key);
            assertEq(raw, vm.toString(seen[i]), string.concat(eid, " ", providers[i], " is not checksummed"));
            for (uint256 j = 0; j < i; j++) assertNotEq(seen[i], seen[j], string.concat(eid, " lists a DVN twice"));
        }
    }

    function _assertAscending(address[] memory list) internal pure {
        for (uint256 i = 1; i < list.length; i++) assertLt(uint160(list[i - 1]), uint160(list[i]));
    }

    function _assertNoOptional(UlnConfig memory uln) internal pure {
        assertEq(uln.optionalDVNCount, NIL);
        assertEq(uln.optionalDVNThreshold, 0);
        assertEq(uln.optionalDVNs.length, 0);
    }

    function _dvns(address dvn) internal pure returns (string memory) {
        return string.concat('{"layerzero-labs":"', vm.toString(dvn), '"}');
    }

    /// @dev A one-chain file (eid 1, chain 11).
    function _file(
        string memory requiredDVNs,
        string memory confirmations,
        string memory dvnsJson
    ) internal pure returns (string memory) {
        return
            string.concat(
                '{"requiredDVNs":',
                requiredDVNs,
                ',"maxMessageSize":10000,"chains":{"1":{"name":"one","chainId":11,"confirmations":',
                confirmations,
                ',"dvns":',
                dvnsJson,
                "}}}"
            );
    }
}

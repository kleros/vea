// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Yaho} from "@hashi/Yaho.sol";
import {IReporter as IHashiReporter} from "@hashi/interfaces/IReporter.sol";
import {IAdapter as IHashiAdapter} from "@hashi/interfaces/IAdapter.sol";
import {Message} from "@hashi/interfaces/IMessage.sol";
import {Reporter} from "../../src/adapters/Reporter.sol";
import {CCIPReporter} from "../../src/adapters/chainlink/CCIPReporter.sol";
import {LayerZeroReporter} from "../../src/adapters/layerZero/LayerZeroReporter.sol";
import {DeBridgeReporter} from "../../src/adapters/deBridge/DeBridgeReporter.sol";
import {AxelarReporter} from "../../src/adapters/axelar/AxelarReporter.sol";
import {VeaReporter} from "../../src/adapters/vea/VeaReporter.sol";
import {IVeaInbox} from "../../src/adapters/vea/interfaces/IVeaInbox.sol";
import "./Mocks.sol";

/// @dev Real Yaho on Arbitrum (42161), a gateway, and the five reporters wired to Story (1514) over mocked bridges.
abstract contract VeashiTestBase is Test {
    uint256 internal constant ARBITRUM = 42161;
    uint256 internal constant STORY = 1514;
    uint256 internal constant STORY_DEBRIDGE_ID = 100000013;
    uint64 internal constant STORY_CCIP_SELECTOR = 4_017_758_515_557_413_000;
    uint32 internal constant STORY_LZ_EID = 30340;

    address internal governor = makeAddr("governor");
    address internal keeper = makeAddr("keeper");
    address internal stranger = makeAddr("stranger");

    Yaho internal yaho;
    GatewayHarness internal gateway;

    MockCCIPRouter internal ccipRouter;
    MockLZEndpoint internal lzEndpoint;
    MockDeBridgeGate internal deBridgeGate;
    MockAxelarGateway internal axelarGateway;
    MockAxelarGasService internal axelarGasService;
    MockVeaInbox internal veaInbox;

    CCIPReporter internal ccipReporter;
    LayerZeroReporter internal lzReporter;
    DeBridgeReporter internal deBridgeReporter;
    AxelarReporter internal axelarReporter;
    VeaReporter internal veaReporter;

    Reporter[] internal reporters;
    address[] internal adapters;

    function setUp() public virtual {
        vm.chainId(ARBITRUM);
        yaho = new Yaho();
        gateway = new GatewayHarness(address(yaho));

        ccipRouter = new MockCCIPRouter();
        lzEndpoint = new MockLZEndpoint();
        deBridgeGate = new MockDeBridgeGate();
        axelarGateway = new MockAxelarGateway();
        axelarGasService = new MockAxelarGasService();
        veaInbox = new MockVeaInbox();

        ccipReporter = new CCIPReporter(address(yaho), address(ccipRouter), governor, keeper);
        lzReporter = new LayerZeroReporter(
            address(yaho),
            address(lzEndpoint),
            governor,
            governor,
            200_000,
            governor,
            keeper
        );
        deBridgeReporter = new DeBridgeReporter(address(yaho), address(deBridgeGate), governor, keeper);
        axelarReporter = new AxelarReporter(
            address(yaho),
            address(axelarGateway),
            address(axelarGasService),
            governor,
            keeper
        );
        address veaAdapter = makeAddr("veaAdapter");
        veaReporter = new VeaReporter(address(yaho), IVeaInbox(address(veaInbox)), veaAdapter, STORY, governor, keeper);

        vm.startPrank(governor);
        ccipReporter.setChainSelectorByChainId(STORY, STORY_CCIP_SELECTOR);
        lzReporter.setEndpointIdByChainId(STORY, STORY_LZ_EID);
        deBridgeReporter.setDeBridgeChainIdByChainId(STORY, STORY_DEBRIDGE_ID);
        deBridgeReporter.setFee(0.003 ether);
        axelarReporter.setChainNameByChainId(STORY, "story");
        axelarReporter.setFee(0.004 ether);
        vm.stopPrank();

        reporters.push(ccipReporter);
        reporters.push(lzReporter);
        reporters.push(deBridgeReporter);
        reporters.push(axelarReporter);
        reporters.push(veaReporter);
        adapters.push(makeAddr("ccipAdapter"));
        adapters.push(makeAddr("lzAdapter"));
        adapters.push(makeAddr("deBridgeAdapter"));
        adapters.push(makeAddr("axelarAdapter"));
        adapters.push(veaAdapter);

        for (uint256 i = 0; i < reporters.length; i++) {
            vm.prank(governor);
            reporters[i].setDispatcher(address(gateway));
            vm.deal(address(reporters[i]), 1 ether);
        }
    }

    function _one(uint256 i) internal view returns (IHashiReporter[] memory r, IHashiAdapter[] memory a) {
        r = new IHashiReporter[](1);
        r[0] = IHashiReporter(address(reporters[i]));
        a = new IHashiAdapter[](1);
        a[0] = IHashiAdapter(adapters[i]);
    }

    function _all() internal view returns (IHashiReporter[] memory r, IHashiAdapter[] memory a) {
        r = new IHashiReporter[](reporters.length);
        a = new IHashiAdapter[](reporters.length);
        for (uint256 i = 0; i < reporters.length; i++) {
            r[i] = IHashiReporter(address(reporters[i]));
            a[i] = IHashiAdapter(adapters[i]);
        }
    }

    /// @dev Hashi's message hash and id for a message `sender` dispatches next through `yaho`.
    function _next(
        address sender,
        uint256 targetChainId,
        uint256 threshold,
        address receiver,
        bytes memory data,
        IHashiReporter[] memory r,
        IHashiAdapter[] memory a
    ) internal view returns (Message memory message, bytes32 messageHash, uint256 messageId) {
        message = Message(yaho.currentNonce(), targetChainId, threshold, sender, receiver, data, r, a);
        messageHash = yaho.calculateMessageHash(message);
        messageId = yaho.calculateMessageId(block.chainid, address(yaho), messageHash);
    }
}

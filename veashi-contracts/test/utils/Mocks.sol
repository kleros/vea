// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Client} from "@chainlink/contracts-ccip/libraries/Client.sol";
import {MessagingParams, MessagingFee, MessagingReceipt} from "../../src/adapters/layerZero/interfaces/ILayerZeroEndpointV2.sol";
import {IReporter as IHashiReporter} from "@hashi/interfaces/IReporter.sol";
import {IAdapter as IHashiAdapter} from "@hashi/interfaces/IAdapter.sol";
import {Message} from "@hashi/interfaces/IMessage.sol";
import {VouchedDispatcher} from "../../src/VouchedDispatcher.sol";
import {IDispatchVoucher} from "../../src/interfaces/IDispatchVoucher.sol";

/// @dev A gateway: dispatches through Yaho with VouchedDispatcher, Yaho in an immutable (no storage slot).
contract GatewayHarness is VouchedDispatcher {
    address internal immutable YAHO;

    constructor(address yaho) {
        YAHO = yaho;
    }

    function dispatch(
        uint256 targetChainId,
        uint256 threshold,
        address receiver,
        bytes memory data,
        IHashiReporter[] memory reporters,
        IHashiAdapter[] memory adapters
    ) external returns (uint256, bytes32[] memory) {
        return _dispatchVouched(targetChainId, threshold, receiver, data, reporters, adapters);
    }

    function _yaho() internal view override returns (address) {
        return YAHO;
    }
}

/// @dev A dispatcher that vouches for whatever hash the test sets.
contract MockVoucher is IDispatchVoucher {
    bytes32 public vouched;

    function setVouched(bytes32 messageHash) external {
        vouched = messageHash;
    }

    function isDispatching(bytes32 messageHash) external view returns (bool) {
        return messageHash == vouched;
    }
}

/// @dev Listed as a reporter, it re-enters the gateway while the gateway is dispatching.
contract ReentrantReporter {
    GatewayHarness public immutable gateway;

    constructor(GatewayHarness gateway_) {
        gateway = gateway_;
    }

    function dispatchMessages(uint256, IHashiAdapter, uint256[] memory, bytes32[] memory) external returns (bytes32) {
        IHashiReporter[] memory reporters = new IHashiReporter[](1);
        IHashiAdapter[] memory adapters = new IHashiAdapter[](1);
        adapters[0] = IHashiAdapter(address(0xADA));
        gateway.dispatch(1, 1, address(0xBEEF), "nested", reporters, adapters);
        return bytes32(0);
    }
}

/// @dev A Yaho stand-in that returns a message id other than the one it computes.
contract WrongIdYaho {
    uint256 public currentNonce;

    function calculateMessageHash(Message memory message) public pure returns (bytes32) {
        return keccak256(abi.encode(message));
    }

    function calculateMessageId(
        uint256 chainId,
        address dispatcher,
        bytes32 messageHash
    ) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(chainId, dispatcher, messageHash)));
    }

    function dispatchMessageToAdapters(
        uint256,
        uint256,
        address,
        bytes calldata,
        IHashiReporter[] calldata,
        IHashiAdapter[] calldata
    ) external payable returns (uint256, bytes32[] memory) {
        return (1, new bytes32[](0));
    }
}

contract MockCCIPRouter {
    uint256 public fee = 0.01 ether;
    bytes public lastExtraArgs;
    bytes public lastData;
    uint64 public lastSelector;
    uint256 public sends;

    function getFee(uint64, Client.EVM2AnyMessage memory) external view returns (uint256) {
        return fee;
    }

    function ccipSend(
        uint64 selector,
        Client.EVM2AnyMessage calldata message
    ) external payable virtual returns (bytes32) {
        require(msg.value == fee, "fee");
        lastExtraArgs = message.extraArgs;
        lastData = message.data;
        lastSelector = selector;
        sends++;
        return keccak256(abi.encode(sends));
    }
}

contract MockLZEndpoint {
    uint256 public fee = 0.02 ether;
    mapping(address => address) public delegates;
    uint32 public lastDstEid;
    uint256 public sends;

    function setDelegate(address delegate) external {
        delegates[msg.sender] = delegate;
    }

    function nativeToken() external pure returns (address) {
        return address(0);
    }

    function quote(MessagingParams calldata, address) external view returns (MessagingFee memory) {
        return MessagingFee(fee, 0);
    }

    function send(MessagingParams calldata params, address) external payable returns (MessagingReceipt memory r) {
        require(msg.value == fee, "fee");
        lastDstEid = params.dstEid;
        sends++;
        r.guid = keccak256(abi.encode(sends));
    }
}

contract MockCallProxy {
    uint256 public submissionChainIdFrom;
    bytes public submissionNativeSender;

    function deliver(uint256 chainIdFrom, address nativeSender, address target, bytes calldata data) external {
        submissionChainIdFrom = chainIdFrom;
        submissionNativeSender = abi.encodePacked(nativeSender);
        (bool success, bytes memory ret) = target.call(data);
        if (!success) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        submissionChainIdFrom = 0;
        delete submissionNativeSender;
    }
}

contract MockDeBridgeGate {
    uint256 public globalFixedNativeFee = 0.001 ether;
    address public callProxy;
    uint256 public lastDstChainId;
    bytes public lastTarget;
    bytes public lastCalldata;
    uint256 public lastFlags;
    uint256 public lastValue;

    constructor() {
        callProxy = address(new MockCallProxy());
    }

    function sendMessage(
        uint256 dstChainId,
        bytes memory target,
        bytes memory data,
        uint256 flags,
        uint32
    ) external payable returns (bytes32) {
        lastDstChainId = dstChainId;
        lastTarget = target;
        lastCalldata = data;
        lastFlags = flags;
        lastValue = msg.value;
        return keccak256(data);
    }
}

contract MockAxelarGateway {
    string public lastChain;
    uint256 public calls;

    function callContract(string calldata chain, string calldata, bytes calldata) external {
        lastChain = chain;
        calls++;
    }

    function validateContractCall(bytes32, string calldata, string calldata, bytes32) external pure returns (bool) {
        return true;
    }
}

contract MockAxelarGasService {
    uint256 public lastValue;

    function payNativeGasForContractCall(
        address,
        string calldata,
        string calldata,
        bytes calldata,
        address
    ) external payable {
        lastValue = msg.value;
    }
}

contract MockVeaInbox {
    uint64 public count;

    function sendMessage(address, bytes memory) external returns (uint64) {
        return count++;
    }
}

contract MockERC20 {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @dev Receives Yaru-executed messages.
contract RecordingReceiver {
    uint256 public lastMessageId;
    uint256 public lastSourceChainId;
    address public lastSender;
    bytes public lastData;

    function onMessage(
        uint256 messageId,
        uint256 sourceChainId,
        address sender,
        uint256,
        IHashiAdapter[] calldata,
        bytes calldata data
    ) external returns (bytes memory) {
        lastMessageId = messageId;
        lastSourceChainId = sourceChainId;
        lastSender = sender;
        lastData = data;
        return "";
    }
}

/// @dev A CCIP router whose `ccipSend` calls back into the reporter's governor (itself) to replace the dispatcher.
contract DispatcherSwitchingCCIPRouter is MockCCIPRouter {
    address public reporter;
    address public nextDispatcher;

    function arm(address reporter_, address nextDispatcher_) external {
        reporter = reporter_;
        nextDispatcher = nextDispatcher_;
    }

    function ccipSend(
        uint64 selector,
        Client.EVM2AnyMessage calldata message
    ) external payable override returns (bytes32) {
        if (reporter != address(0)) {
            (bool success, ) = reporter.call(abi.encodeWithSignature("setDispatcher(address)", nextDispatcher));
            require(success, "setDispatcher");
        }
        return keccak256(abi.encode(selector, message.data));
    }
}

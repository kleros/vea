// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Client} from "@chainlink/contracts-ccip/libraries/Client.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev A plain ERC20 (approve, allowance, transferFrom), so SafeERC20's forceApprove and a pulling router work.
contract CCIPFeeTokenMock {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// @dev A CCIP router that, like the real one, pulls the fee in `message.feeToken` from the sender with
/// transferFrom and takes no native value then; with no fee token it takes the fee as msg.value.
contract CCIPFeeTokenRouterMock {
    uint256 public fee = 0.01 ether;
    /// @dev The fixed fee when paid in a fee token, priced apart from the native one as the real router does.
    uint256 public tokenFee = 2 ether;
    /// @dev Fee per byte of message data, so a quote depends on the message.
    uint256 public perByte;
    address public lastFeeToken;
    uint256 public lastFeePaid;
    uint256 public sends;

    function setPerByte(uint256 perByte_) external {
        perByte = perByte_;
    }

    function getFee(uint64, Client.EVM2AnyMessage memory message) public view returns (uint256) {
        return (message.feeToken == address(0) ? fee : tokenFee) + message.data.length * perByte;
    }

    function ccipSend(uint64 selector, Client.EVM2AnyMessage calldata message) external payable returns (bytes32) {
        uint256 amount = getFee(selector, message);
        if (message.feeToken == address(0)) {
            require(msg.value == amount, "fee");
        } else {
            require(msg.value == 0, "msg.value");
            require(IERC20(message.feeToken).transferFrom(msg.sender, address(this), amount), "transferFrom");
        }
        lastFeeToken = message.feeToken;
        lastFeePaid = amount;
        sends++;
        return keccak256(abi.encode(sends));
    }
}

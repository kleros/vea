// SPDX-License-Identifier: MIT
/**
 *  @authors: [@mani99brar]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */
pragma solidity ^0.8.18;

/**
 * @title Lightbulb
 * @dev A lightbulb controlled by a cross-chain switch connected with the Vea bridge.
 *
 */
contract Lightbulb {
    event LightBulbTurnedOn(address indexed lightBulbOwner, uint256 indexed messageId);

    address owner;
    address public yaru;
    uint256 public SOURCE_CHAIN_ID;
    address public lightBulbSwitch; // The switch on arbitrum that controls this lightbulb.
    mapping(address => bool) public lightBulbIsOn;
    bool switchOn = true;

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    constructor(address _owner, address _yaru, address _lightBulbSwitch, uint256 _sourceChainId) {
        owner = _owner;
        yaru = _yaru;
        lightBulbSwitch = _lightBulbSwitch;
        SOURCE_CHAIN_ID = _sourceChainId;
    }

    function flipSwitch(bool _switchOn) external onlyOwner {
        switchOn = _switchOn;
    }

    /// @dev Function that gets triggered when the message is relayed, called by Yaru contract
    /// @param chainId chainId of the chain where message is sending from
    /// @param sender sender contract
    /// @param threshold threshold of the message that should be met by adapters
    /// @param adapters an array of adapters to check the threshold with
    /// @param data abi-encoded message
    /// @return
    function onMessage(
        uint256 messageId,
        uint256 chainId,
        address sender,
        uint256 threshold,
        address[] memory adapters,
        bytes memory data
    ) external returns (bytes memory) {
        require(msg.sender == yaru, "only called by Yaru");
        require(chainId == SOURCE_CHAIN_ID, "invalid source chain ID");
        require(sender == lightBulbSwitch, "invalid sender address from source chain");

        // Decode the message and store it
        address lightBulbOwner = abi.decode(data, (address));
        lightBulbIsOn[lightBulbOwner] = true;

        emit LightBulbTurnedOn(lightBulbOwner, messageId);
        return "";
    }

    function offBulb() external {
        lightBulbIsOn[msg.sender] = false;
    }
}

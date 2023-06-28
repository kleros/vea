// https://github.com/OpenZeppelin/openzeppelin-contracts/blob/5daaf60d11ee2075260d0f3adfb22b1c536db983/contracts/token/ERC20/BurnableToken.sol
// implementation: https://gnosisscan.io/address/0xf8d1677c8a0c961938bf2f9adc3f3cfda759a9d9#code
// proxy: https://gnosisscan.io/token/0x6a023ccd1ff6f2045c3309768ead9e68f978f6e1#readProxyContract

/**
 * @title Burnable Token
 * @dev Token that can be irreversibly burned (destroyed).
 */
interface IWETH {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Burn(address indexed burner, uint256 value);

    /**
     * @dev Burns a specific amount of tokens.
     * @param _value The amount of token to be burned.
     */
    function burn(uint256 _value) external;

    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Transfer tokens from one address to another
     * @param _from address The address which you want to send tokens from
     * @param _to address The address which you want to transfer to
     * @param _value uint256 the amount of tokens to be transferred
     */
    function transferFrom(address _from, address _to, uint256 _value) external returns (bool);
}

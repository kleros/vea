const { getCreateAddress } = require("ethers");

/**
 * Gets the address of a soon to be deployed contract.
 * @param {string} deployer The address of the deployer account.
 * @param {number|bigint} nonce The current nonce for the deployer account.
 * @return {string} The address of a contract if it is deployed in the next transaction sent by the deployer account.
 */
function getContractAddress(deployer, nonce) {
  return getCreateAddress({
    from: deployer,
    nonce: nonce,
  });
}

module.exports = getContractAddress;

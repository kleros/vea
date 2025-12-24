import { keccak256, AbiCoder, getBytes, isHexString, getAddress, toBeArray } from "ethers";
import type { HashiMessage } from "./hashiTypes";

const coder = AbiCoder.defaultAbiCoder();

export function calculateMessageHash(message: HashiMessage): string {
  const encoded = encodeMessageForAbi(message);
  return keccak256(encoded);
}

export function getHashiMsgId(
  sourceChainId: bigint | number | string,
  dispatcherAddress: string,
  message: HashiMessage
): BigInt {
  // Normalize exactly as Solidity would see inputs
  const source = BigInt(sourceChainId);
  const dispatcher = getAddress(dispatcherAddress); // checksum normalize

  const msgHash = calculateMessageHash(message);
  const encodedId = coder.encode(["uint256", "address", "bytes32"], [source, dispatcher, msgHash]);
  return hexToBigInt32Bytes(keccak256(encodedId));
}

function encodeMessageForAbi(message: HashiMessage): string {
  // Strict normalization
  const nonce = BigInt(message.nonce);
  const targetChainId = BigInt(message.targetChainId);
  const threshold = BigInt(message.threshold);

  const sender = getAddress(message.sender);
  const receiver = getAddress(message.receiver);

  const data =
    typeof message.data === "string"
      ? isHexString(message.data)
        ? message.data
        : (() => {
            throw new Error("message.data must be 0x-hex");
          })()
      : getBytes(message.data);

  // Preserve array order and checksum-normalize each address
  const reporters = message.reporters.map(getAddress);
  const adapters = message.adapters.map(getAddress);

  // Exact struct layout as tuple for abi.encode(message)
  return coder.encode(
    [
      "tuple(uint256 nonce,uint256 targetChainId,uint256 threshold,address sender,address receiver,bytes data,address[] reporters,address[] adapters)",
    ],
    [{ nonce, targetChainId, threshold, sender, receiver, data, reporters, adapters }]
  );
}

function hexToBigInt32Bytes(hex32: string): bigint {
  const bytes = toBeArray(hex32);
  // Convert bytes to BigInt (big-endian)
  let n = BigInt(0);
  for (const b of Array.from(bytes)) {
    n = (n << BigInt(8)) + BigInt(b);
  }
  return n;
}

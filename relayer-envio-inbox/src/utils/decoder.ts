import { hexToBuffer } from "./merkle";

export function decodeNodeData(nodeDataHex: string): {
  nonce: bigint;
  to: string;
  msgSender: string;
  data: string;
} {
  const bytes = hexToBuffer(nodeDataHex);
  const nonce = bytes.readBigUInt64BE(0);
  const to = "0x" + bytes.subarray(8, 28).toString("hex");
  const msgSender = "0x" + bytes.subarray(28, 48).toString("hex");
  const data = "0x" + bytes.subarray(48).toString("hex");
  return { nonce, to, msgSender, data };
}

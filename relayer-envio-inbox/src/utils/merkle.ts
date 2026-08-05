import { keccak256 } from "ethers";

export function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex.startsWith("0x") ? hex.slice(2) : hex, "hex");
}

export function concatAndSort(a: string, b: string): string {
  const aHex = a.startsWith("0x") ? a.slice(2) : a;
  const bHex = b.startsWith("0x") ? b.slice(2) : b;
  const aBytes = Buffer.from(aHex, "hex");
  const bBytes = Buffer.from(bHex, "hex");
  for (let i = 0; i < 32; i++) {
    if (aBytes[i] < bBytes[i]) return `0x${aHex}${bHex}`;
    if (aBytes[i] > bBytes[i]) return `0x${bHex}${aHex}`;
  }
  return `0x${aHex}${aHex}`;
}

export function leafHash(nodeDataHex: string): string {
  return keccak256(keccak256(nodeDataHex));
}

export function hashPair(a: string, b: string): string {
  return keccak256(concatAndSort(a, b));
}

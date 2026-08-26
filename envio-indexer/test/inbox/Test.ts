import { decodeNodeData } from "../../src/utils/decoder";
import { leafHash, hashPair, concatAndSort } from "../../src/utils/merkle";

// 8-byte nonce (1, big-endian) + 20-byte to + 20-byte msgSender + 4-byte data
const mockNodeData =
  "0x" +
  "0000000000000001" + // nonce = 1
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" + // to
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" + // msgSender
  "deadbeef"; // data

describe("decodeNodeData", () => {
  it("decodes nonce as big-endian uint64", () => {
    const { nonce } = decodeNodeData(mockNodeData);
    expect(nonce).toBe(1n);
  });

  it("decodes to address", () => {
    const { to } = decodeNodeData(mockNodeData);
    expect(to).toBe("0x" + "aa".repeat(20));
  });

  it("decodes msgSender address", () => {
    const { msgSender } = decodeNodeData(mockNodeData);
    expect(msgSender).toBe("0x" + "bb".repeat(20));
  });

  it("decodes remaining bytes as data", () => {
    const { data } = decodeNodeData(mockNodeData);
    expect(data).toBe("0xdeadbeef");
  });

  it("returns empty data when nodeData has no trailing bytes", () => {
    const noData =
      "0x" +
      "0000000000000000" +
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" +
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const { data } = decodeNodeData(noData);
    expect(data).toBe("0x");
  });
});

describe("leafHash", () => {
  it("returns a 32-byte hex hash", () => {
    const hash = leafHash(mockNodeData);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(leafHash(mockNodeData)).toBe(leafHash(mockNodeData));
  });

  it("differs for different inputs", () => {
    const other =
      "0x" +
      "0000000000000002" +
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" +
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(leafHash(mockNodeData)).not.toBe(leafHash(other));
  });
});

describe("concatAndSort", () => {
  it("places the lexicographically smaller hash first", () => {
    const a = "0x" + "aa".repeat(32);
    const b = "0x" + "bb".repeat(32);
    expect(concatAndSort(a, b)).toBe("0x" + "aa".repeat(32) + "bb".repeat(32));
    expect(concatAndSort(b, a)).toBe("0x" + "aa".repeat(32) + "bb".repeat(32));
  });
});

describe("hashPair", () => {
  it("returns a 32-byte hex hash", () => {
    const a = "0x" + "aa".repeat(32);
    const b = "0x" + "bb".repeat(32);
    expect(hashPair(a, b)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("is order-independent (sorted concat)", () => {
    const a = "0x" + "aa".repeat(32);
    const b = "0x" + "bb".repeat(32);
    expect(hashPair(a, b)).toBe(hashPair(b, a));
  });
});

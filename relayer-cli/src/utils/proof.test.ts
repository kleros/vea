import { getProofIndices } from "./proof";

describe("proof", () => {
  describe("getProofIndices", () => {
    it("should return an empty array", () => {
      const result = getProofIndices(7, 7);
      expect(result).toEqual([]);
    });
    it("should return the proof indices", () => {
      const expectedProofIndices = ["3", "0,1", "4,6"];
      const result = getProofIndices(2, 7);
      expect(result).toEqual(expectedProofIndices);
    });
    it("should return the proof indices(for a large count", () => {
      const expectedProofIndices = ["6", "4,5", "0,3", "8,14"];
      const result = getProofIndices(7, 15);
      expect(result).toEqual(expectedProofIndices);
    });
  });
});

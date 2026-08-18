import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  filterByThreshold,
  parseVector,
  topKByCosine,
} from "~/lib/vector";

describe("parseVector", () => {
  it("accepts a finite number array", () => {
    expect(parseVector([0.1, -0.2, 1])).toEqual([0.1, -0.2, 1]);
  });

  it("rejects empty, non-arrays, and non-finite values", () => {
    expect(parseVector([])).toBeNull();
    expect(parseVector("nope")).toBeNull();
    expect(parseVector([1, Number.NaN])).toBeNull();
    expect(parseVector([1, Number.POSITIVE_INFINITY])).toBeNull();
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns 0 for length mismatch or zero vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("is higher for closer directions than distant ones", () => {
    const query = [1, 0];
    const close = cosineSimilarity(query, [0.9, 0.1]);
    const far = cosineSimilarity(query, [0.1, 0.9]);
    expect(close).toBeGreaterThan(far);
  });
});

describe("topKByCosine", () => {
  const items = [
    { id: "a", vector: [1, 0] },
    { id: "b", vector: [0.8, 0.2] },
    { id: "c", vector: [0, 1] },
  ];

  it("returns the k nearest items by score", () => {
    const ranked = topKByCosine([1, 0], items, 2);
    expect(ranked.map((r) => r.id)).toEqual(["a", "b"]);
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  it("returns an empty list for k <= 0", () => {
    expect(topKByCosine([1, 0], items, 0)).toEqual([]);
  });
});

describe("filterByThreshold", () => {
  it("keeps only scores at or above the threshold", () => {
    const items = [
      { id: "high", score: 0.95 },
      { id: "edge", score: 0.9 },
      { id: "low", score: 0.89 },
    ];
    expect(filterByThreshold(items, 0.9).map((i) => i.id)).toEqual([
      "high",
      "edge",
    ]);
  });
});

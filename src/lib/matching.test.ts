import { describe, expect, it } from "vitest";
import { matchAnswer, normalizeText, levenshteinDistance } from "~/lib/matching";

describe("normalizeText", () => {
  it("trims, lowercases, and collapses spaces", () => {
    expect(normalizeText("  Hello   World  ")).toBe("hello world");
  });

  it("removes diacritics by default", () => {
    expect(normalizeText("café")).toBe("cafe");
  });

  it("strips leading English 'to '", () => {
    expect(normalizeText("to run")).toBe("run");
  });
});

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("haus", "haus")).toBe(0);
  });

  it("counts substitutions", () => {
    expect(levenshteinDistance("haus", "haut")).toBe(1);
  });
});

describe("matchAnswer", () => {
  it("accepts exact matches after normalization", () => {
    const result = matchAnswer({
      userAnswer: " Window ",
      expected: "window",
    });
    expect(result.isCorrect).toBe(true);
    expect(result.isTypo).toBe(false);
  });

  it("accepts variants", () => {
    const result = matchAnswer({
      userAnswer: "Fenschter",
      expected: "Fänschter",
      variants: ["Fenschter"],
    });
    expect(result.isCorrect).toBe(true);
    expect(result.matchedVariant).toBe("Fenschter");
  });

  it("accepts minor typos as correct with typo flag", () => {
    const result = matchAnswer({
      userAnswer: "windo",
      expected: "window",
    });
    expect(result.isCorrect).toBe(true);
    expect(result.isTypo).toBe(true);
  });

  it("rejects large differences", () => {
    const result = matchAnswer({
      userAnswer: "door",
      expected: "window",
    });
    expect(result.isCorrect).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  BOX_DAYS,
  MAX_BOX,
  MIN_BOX,
  applyLeitnerResult,
  conjugationCardKey,
  getBoxIntervalDays,
  getLeitnerIntervalsForDisplay,
  nextBoxOnCorrect,
  nextBoxOnWrong,
  scheduleNextReview,
  tenseKeyFromConjugationCardKey,
  VOCAB_CARD_KEY,
} from "~/lib/leitner";

describe("leitner", () => {
  it("uses 0 days for box 1", () => {
    expect(getBoxIntervalDays(1)).toBe(0);
    expect(BOX_DAYS[1]).toBe(0);
  });

  it("caps promotion at MAX_BOX", () => {
    expect(nextBoxOnCorrect(MAX_BOX)).toBe(MAX_BOX);
    expect(nextBoxOnCorrect(3)).toBe(4);
  });

  it("resets to MIN_BOX on wrong", () => {
    expect(nextBoxOnWrong()).toBe(MIN_BOX);
  });

  it("schedules next review from box interval", () => {
    const from = new Date("2026-01-01T12:00:00.000Z");
    const next = scheduleNextReview(3, from);
    expect(next.toISOString()).toBe("2026-01-08T12:00:00.000Z");
  });

  it("exposes display intervals for boxes 1–6", () => {
    const intervals = getLeitnerIntervalsForDisplay();
    expect(intervals).toHaveLength(6);
    expect(intervals[0]).toEqual({ box: 1, days: 0 });
    expect(intervals[5]).toEqual({ box: 6, days: 60 });
  });

  it("applies box move and schedule in one step", () => {
    const from = new Date("2026-01-01T12:00:00.000Z");
    const promoted = applyLeitnerResult(2, true, from);
    expect(promoted.boxAfter).toBe(3);
    expect(promoted.nextReviewAt.toISOString()).toBe("2026-01-08T12:00:00.000Z");

    const reset = applyLeitnerResult(5, false, from);
    expect(reset.boxAfter).toBe(MIN_BOX);
    expect(reset.nextReviewAt.toISOString()).toBe("2026-01-01T12:00:00.000Z");
  });

  it("builds stable conjugation card keys from tense, not form ids", () => {
    expect(VOCAB_CARD_KEY).toBe("vocab");
    expect(conjugationCardKey("present")).toBe("conj:present");
    expect(tenseKeyFromConjugationCardKey("conj:present")).toBe("present");
    expect(tenseKeyFromConjugationCardKey("vocab")).toBeNull();
  });
});

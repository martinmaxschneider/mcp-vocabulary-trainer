import { describe, expect, it } from "vitest";
import {
  BOX_DAYS,
  MAX_BOX,
  MIN_BOX,
  getBoxIntervalDays,
  getLeitnerIntervalsForDisplay,
  nextBoxOnCorrect,
  nextBoxOnWrong,
  scheduleNextReview,
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
});

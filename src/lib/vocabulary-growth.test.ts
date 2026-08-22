import { describe, expect, it } from "vitest";
import {
  buildVocabularyGrowth,
  inBoxesTotal,
  sliceGrowthDays,
  stackTotal,
} from "~/lib/vocabulary-growth";

describe("vocabulary-growth", () => {
  it("returns empty series when there are no events", () => {
    expect(buildVocabularyGrowth([], [], "2026-08-22")).toEqual({
      daily: [],
      cumulative: [],
    });
  });

  it("buckets progress on the same day and fills gaps with zeros", () => {
    const { daily, cumulative } = buildVocabularyGrowth(
      [
        { createdAt: new Date(2026, 7, 20), kind: "vocab" },
        { createdAt: new Date(2026, 7, 20), kind: "vocab" },
        { createdAt: new Date(2026, 7, 20), kind: "satze" },
        { createdAt: new Date(2026, 7, 22), kind: "conjugations" },
      ],
      [],
      "2026-08-22",
    );

    expect(daily).toEqual([
      { date: "2026-08-20", vocab: 2, satze: 1, conjugations: 0, waiting: 0 },
      { date: "2026-08-21", vocab: 0, satze: 0, conjugations: 0, waiting: 0 },
      { date: "2026-08-22", vocab: 0, satze: 0, conjugations: 1, waiting: 0 },
    ]);
    expect(cumulative.map((day) => ({ ...day, waiting: day.waiting }))).toEqual([
      { date: "2026-08-20", vocab: 2, satze: 1, conjugations: 0, waiting: 0 },
      { date: "2026-08-21", vocab: 2, satze: 1, conjugations: 0, waiting: 0 },
      { date: "2026-08-22", vocab: 2, satze: 1, conjugations: 1, waiting: 0 },
    ]);
    expect(inBoxesTotal(cumulative[2]!)).toBe(4);
  });

  it("puts catalog items still outside the boxes on the red waiting layer", () => {
    const { cumulative } = buildVocabularyGrowth(
      [
        { createdAt: new Date(2026, 7, 21), kind: "vocab" },
        { createdAt: new Date(2026, 7, 22), kind: "vocab" },
      ],
      [
        { createdAt: new Date(2026, 7, 20), kind: "vocab" },
        { createdAt: new Date(2026, 7, 20), kind: "vocab" },
        { createdAt: new Date(2026, 7, 20), kind: "vocab" },
        { createdAt: new Date(2026, 7, 20), kind: "satze" },
      ],
      "2026-08-22",
    );

    expect(cumulative).toEqual([
      {
        date: "2026-08-20",
        vocab: 0,
        satze: 0,
        conjugations: 0,
        waiting: 4,
      },
      {
        date: "2026-08-21",
        vocab: 1,
        satze: 0,
        conjugations: 0,
        waiting: 3,
      },
      {
        date: "2026-08-22",
        vocab: 2,
        satze: 0,
        conjugations: 0,
        waiting: 2,
      },
    ]);
    expect(stackTotal(cumulative[0]!)).toBe(4);
    expect(stackTotal(cumulative[2]!)).toBe(4);
  });

  it("extends the series through today even after the last event", () => {
    const { daily, cumulative } = buildVocabularyGrowth(
      [{ createdAt: new Date(2026, 7, 20), kind: "satze" }],
      [{ createdAt: new Date(2026, 7, 20), kind: "satze" }],
      "2026-08-22",
    );
    expect(daily.map((day) => day.date)).toEqual([
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
    ]);
    expect(cumulative.at(-1)).toEqual({
      date: "2026-08-22",
      vocab: 0,
      satze: 1,
      conjugations: 0,
      waiting: 0,
    });
  });

  it("slices the last N days and keeps the full series for all", () => {
    const days = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-08-1${i + 1}`,
      vocab: i,
    }));
    expect(sliceGrowthDays(days, 3).map((day) => day.date)).toEqual([
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
    ]);
    expect(sliceGrowthDays(days, "all")).toHaveLength(5);
    expect(sliceGrowthDays(days, 90)).toHaveLength(5);
  });
});

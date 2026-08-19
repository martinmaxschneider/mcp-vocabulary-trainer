import { describe, expect, it } from "vitest";
import {
  dailyItemKey,
  interleaveByType,
  parseDailyPackageConfig,
  pickStratified,
} from "~/lib/daily";

describe("daily helpers", () => {
  it("parses stored slider config", () => {
    expect(parseDailyPackageConfig({ satzCount: 3, vocabCount: 4, conjCount: 1 }))
      .toEqual({ satzCount: 3, vocabCount: 4, conjCount: 1 });
    expect(parseDailyPackageConfig(null)).toBeNull();
  });

  it("interleaves types instead of emitting blocks", () => {
    const ordered = interleaveByType([
      [{ itemType: "SATZ" }, { itemType: "SATZ" }],
      [{ itemType: "ENTRY" }],
      [{ itemType: "CONJUGATION" }],
    ]);
    expect(ordered.map((item) => item.itemType)).toEqual([
      "SATZ",
      "ENTRY",
      "CONJUGATION",
      "SATZ",
    ]);
  });

  it("spreads picks across domains", () => {
    const items = [
      { key: "a", domainId: "d1", weight: 1 },
      { key: "b", domainId: "d1", weight: 1 },
      { key: "c", domainId: "d2", weight: 1 },
      { key: "d", domainId: "d2", weight: 1 },
    ];
    const picked = pickStratified(items, 2);
    const domains = new Set(picked.map((item) => item.domainId));
    expect(picked).toHaveLength(2);
    expect(domains.size).toBe(2);
  });

  it("builds stable item keys", () => {
    expect(dailyItemKey("CONJUGATION", "tr1", "present")).toBe(
      "CONJUGATION:tr1:present",
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  computeStreak,
  levelForXp,
  localDateString,
  masteryPercent,
  resolveCelebrations,
  shiftDateString,
  xpForAnswer,
} from "~/lib/gamification-config";

describe("gamification-config", () => {
  it("awards less XP for typos than clean answers", () => {
    expect(xpForAnswer(true, false)).toBe(10);
    expect(xpForAnswer(true, true)).toBe(5);
    expect(xpForAnswer(false)).toBe(2);
  });

  it("computes mastery from Leitner boxes including unseen cards", () => {
    expect(masteryPercent([{ box: 6 }, { box: 1 }], 4)).toBe(25);
    expect(masteryPercent([{ box: 6 }], 1)).toBe(100);
    expect(masteryPercent([], 0)).toBe(0);
  });

  it("maps XP to the highest matching level", () => {
    expect(levelForXp(0).key).toBe("beginner");
    expect(levelForXp(200).key).toBe("learner");
    expect(levelForXp(9999).key).toBe("fluent");
    expect(levelForXp(10000).key).toBe("master");
    expect(levelForXp(10000).nextMinXp).toBeNull();
  });

  it("keeps yesterday's streak while today's goal is still open", () => {
    const today = "2026-08-16";
    const streak = computeStreak(
      [
        { date: "2026-08-15", xp: 50 },
        { date: "2026-08-14", xp: 80 },
        { date: "2026-08-13", xp: 10 },
      ],
      50,
      today,
    );
    expect(streak).toBe(2);
  });

  it("includes today once the goal is met", () => {
    const streak = computeStreak(
      [
        { date: "2026-08-16", xp: 50 },
        { date: "2026-08-15", xp: 50 },
      ],
      50,
      "2026-08-16",
    );
    expect(streak).toBe(2);
  });

  it("shifts local date strings across month boundaries", () => {
    expect(shiftDateString("2026-03-01", -1)).toBe("2026-02-28");
    expect(localDateString(new Date(2026, 7, 16))).toBe("2026-08-16");
  });

  it("only celebrates a perfect session above the configured card minimum", () => {
    const tooSmall = resolveCelebrations({
      perfectSession: true,
      sessionAnswers: 4,
    });
    expect(tooSmall.some((event) => event.kind === "perfectSession")).toBe(
      false,
    );

    const enough = resolveCelebrations({
      perfectSession: true,
      sessionAnswers: 10,
    });
    expect(enough.some((event) => event.kind === "perfectSession")).toBe(true);
  });
});

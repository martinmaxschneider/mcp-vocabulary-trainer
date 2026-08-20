import { describe, expect, it } from "vitest";
import {
  isMobilePackDownloadable,
  toMobileDailyPackage,
} from "~/lib/mobile-daily";

describe("isMobilePackDownloadable", () => {
  it("requires an active or testing pack with at least one clip", () => {
    expect(
      isMobilePackDownloadable({
        status: "ACTIVE",
        items: [{ clips: [{ url: "/api/audio/a" }] }],
      }),
    ).toBe(true);
    expect(
      isMobilePackDownloadable({
        status: "TESTING",
        items: [{ clips: [{ url: "/api/audio/a" }] }],
      }),
    ).toBe(true);
    expect(
      isMobilePackDownloadable({
        status: "DRAFT",
        items: [{ clips: [{ url: "/api/audio/a" }] }],
      }),
    ).toBe(false);
    expect(
      isMobilePackDownloadable({ status: "ACTIVE", items: [{ clips: [] }] }),
    ).toBe(false);
  });
});

describe("toMobileDailyPackage", () => {
  it("keeps listen fields and drops extra hydration data", () => {
    const mapped = toMobileDailyPackage({
      id: "pkg-1",
      date: "2026-08-20",
      targetLang: "es",
      status: "ACTIVE",
      audioReady: true,
      audioDone: 1,
      audioTotal: 1,
      items: [
        {
          id: "item-1",
          itemType: "SATZ",
          targetText: "Hola",
          nativeText: "Hallo",
          tenseLabel: null,
          domain: { id: "d1", name: "Alltag" },
          questionText: "¿Qué dices?",
          questionTranslation: "Was sagst du?",
          audioStatus: "DONE",
          clips: [
            { url: "/api/audio/main/a", durationMs: 900, kind: "main" },
            { url: "/api/audio/a", durationMs: 800, kind: "translation" },
          ],
        },
      ],
    });

    expect(mapped.downloadable).toBe(true);
    expect(mapped.items).toHaveLength(1);
    expect(mapped.items[0]).toEqual({
      id: "item-1",
      itemType: "SATZ",
      targetText: "Hola",
      nativeText: "Hallo",
      tenseLabel: null,
      domain: { id: "d1", name: "Alltag" },
      questionText: "¿Qué dices?",
      questionTranslation: "Was sagst du?",
      audioStatus: "DONE",
      clips: [
        { url: "/api/audio/main/a", durationMs: 900, kind: "main" },
        { url: "/api/audio/a", durationMs: 800, kind: "translation" },
      ],
    });
  });
});

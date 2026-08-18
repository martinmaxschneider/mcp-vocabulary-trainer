import { describe, expect, it } from "vitest";
import {
  audioPublicPath,
  audioUrlWithVersion,
  isAudioTranslationId,
  mainAudioPublicPath,
  playbackUrls,
  voiceForSatz,
} from "~/lib/satz-tts";

describe("satz tts helpers", () => {
  it("uses different voices for question and answer", () => {
    expect(voiceForSatz("Wo ist der Bahnhof?")).toBe("am_onyx");
    expect(voiceForSatz("Gleich um die Ecke.")).toBe("af_nova");
  });

  it("builds a safe public audio path", () => {
    expect(audioPublicPath("clxyz123")).toBe("/api/audio/clxyz123");
    expect(isAudioTranslationId("clxyz1234567890abcd")).toBe(true);
    expect(isAudioTranslationId("../secret")).toBe(false);
    expect(isAudioTranslationId("")).toBe(false);
    expect(mainAudioPublicPath("clxyz123")).toBe("/api/audio/main/clxyz123");
    expect(audioUrlWithVersion("/api/audio/abc", 1700000000000)).toBe(
      "/api/audio/abc?v=1700000000000",
    );
    expect(
      playbackUrls({
        mainUrl: "/api/audio/main/a",
        mainStatus: "DONE",
        mainUpdatedAt: 1,
        translationUrl: "/api/audio/b",
        translationStatus: "DONE",
        translationUpdatedAt: 2,
      }),
    ).toEqual(["/api/audio/main/a?v=1", "/api/audio/b?v=2"]);
  });
});

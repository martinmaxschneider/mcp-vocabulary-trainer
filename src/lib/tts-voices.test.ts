import { describe, expect, it } from "vitest";
import { voiceMatchesLang, voicesForLang } from "~/lib/tts-voices";

describe("tts voice language filter", () => {
  it("matches Kokoro prefixes and locale-style ids", () => {
    expect(voiceMatchesLang("am_onyx", "en")).toBe(true);
    expect(voiceMatchesLang("ff_siwis", "fr")).toBe(true);
    expect(voiceMatchesLang("ef_dora", "es")).toBe(true);
    expect(voiceMatchesLang("de-DE-Klaus", "de")).toBe(true);
    expect(voiceMatchesLang("aura-2-agathe-fr", "fr")).toBe(true);
    expect(voiceMatchesLang("am_onyx", "fr")).toBe(false);
    expect(voiceMatchesLang("de-DE-Klaus", "gsw")).toBe(true);
  });

  it("returns matching voices or the full list when none match", () => {
    expect(voicesForLang(["am_onyx", "ff_siwis", "af_nova"], "fr")).toEqual([
      "ff_siwis",
    ]);
    expect(voicesForLang(["Puck", "Kore"], "fr")).toEqual(["Puck", "Kore"]);
  });
});

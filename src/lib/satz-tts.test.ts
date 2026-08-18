import { describe, expect, it } from "vitest";
import {
  audioPublicPath,
  isAudioTranslationId,
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
  });
});

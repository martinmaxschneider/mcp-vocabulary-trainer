import { describe, expect, it } from "vitest";
import {
  defaultTtsProfile,
  embeddingModelAliases,
  isLegacyTtsModel,
  isSameEmbeddingModel,
  isSettingsTab,
  migrateTtsVoice,
  parseTtsProfiles,
} from "~/lib/ai-settings";

describe("ai settings helpers", () => {
  it("treats OpenAI slug aliases as the same embedding model", () => {
    expect(isSameEmbeddingModel("text-embedding-3-small", "openai/text-embedding-3-small")).toBe(
      true,
    );
    expect(embeddingModelAliases("openai/text-embedding-3-small")).toContain(
      "text-embedding-3-small",
    );
  });

  it("accepts known settings tabs", () => {
    expect(isSettingsTab("ai")).toBe(true);
    expect(isSettingsTab("logs")).toBe(true);
    expect(isSettingsTab("unknown")).toBe(false);
    expect(isSettingsTab(null)).toBe(false);
  });

  it("maps legacy OpenAI TTS voices onto Kokoro", () => {
    expect(isLegacyTtsModel("openai/tts-1-hd")).toBe(true);
    expect(migrateTtsVoice("onyx")).toBe("am_onyx");
    expect(migrateTtsVoice("nova")).toBe("af_nova");
  });

  it("parses stored TTS profiles and ignores invalid rows", () => {
    expect(parseTtsProfiles(null)).toEqual({});
    expect(
      parseTtsProfiles({
        fr: { model: "hexgrad/kokoro-82m", voiceQuestion: "ff_siwis", voiceAnswer: "ff_siwis" },
        bad: { model: "" },
      }),
    ).toEqual({
      fr: { model: "hexgrad/kokoro-82m", voiceQuestion: "ff_siwis", voiceAnswer: "ff_siwis" },
    });
    expect(defaultTtsProfile("fr").voiceQuestion).toBe("ff_siwis");
  });
});

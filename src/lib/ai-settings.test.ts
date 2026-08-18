import { describe, expect, it } from "vitest";
import {
  embeddingModelAliases,
  isSameEmbeddingModel,
  isSettingsTab,
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
});

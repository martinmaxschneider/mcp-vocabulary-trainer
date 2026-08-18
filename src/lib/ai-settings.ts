export const DEFAULT_CHAT_MODEL = "openai/gpt-4o-mini";
export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const DEFAULT_TTS_MODEL = "openai/tts-1-hd";
export const DEFAULT_TTS_VOICE_QUESTION = "onyx";
export const DEFAULT_TTS_VOICE_ANSWER = "nova";

export const APP_SETTINGS_ID = "default";

export const SETTINGS_TABS = [
  "general",
  "learning",
  "ai",
  "logs",
  "system",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export function isSettingsTab(value: string | null): value is SettingsTab {
  return SETTINGS_TABS.includes(value as SettingsTab);
}

export function embeddingModelAliases(model: string): string[] {
  const bare = model.replace(/^openai\//, "");
  return [...new Set([model, bare, `openai/${bare}`])];
}

export function isSameEmbeddingModel(stored: string, configured: string): boolean {
  return embeddingModelAliases(configured).includes(stored);
}

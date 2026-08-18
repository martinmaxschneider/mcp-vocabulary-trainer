export const DEFAULT_CHAT_MODEL = "openai/gpt-4o-mini";
export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const DEFAULT_TTS_MODEL = "hexgrad/kokoro-82m";
export const DEFAULT_TTS_VOICE_QUESTION = "am_onyx";
export const DEFAULT_TTS_VOICE_ANSWER = "af_nova";

export type TtsLangProfile = {
  model: string;
  voiceQuestion: string;
  voiceAnswer: string;
};

export type TtsProfiles = Record<string, TtsLangProfile>;

export const DEFAULT_TTS_PROFILES: TtsProfiles = {
  en: {
    model: DEFAULT_TTS_MODEL,
    voiceQuestion: "am_onyx",
    voiceAnswer: "af_nova",
  },
  fr: {
    model: DEFAULT_TTS_MODEL,
    voiceQuestion: "ff_siwis",
    voiceAnswer: "ff_siwis",
  },
  es: {
    model: DEFAULT_TTS_MODEL,
    voiceQuestion: "em_alex",
    voiceAnswer: "ef_dora",
  },
  pt: {
    model: DEFAULT_TTS_MODEL,
    voiceQuestion: "pm_alex",
    voiceAnswer: "pf_dora",
  },
  de: {
    model: DEFAULT_TTS_MODEL,
    voiceQuestion: DEFAULT_TTS_VOICE_QUESTION,
    voiceAnswer: DEFAULT_TTS_VOICE_ANSWER,
  },
  gsw: {
    model: DEFAULT_TTS_MODEL,
    voiceQuestion: DEFAULT_TTS_VOICE_QUESTION,
    voiceAnswer: DEFAULT_TTS_VOICE_ANSWER,
  },
};

export function defaultTtsProfile(lang: string): TtsLangProfile {
  return (
    DEFAULT_TTS_PROFILES[lang] ?? {
      model: DEFAULT_TTS_MODEL,
      voiceQuestion: DEFAULT_TTS_VOICE_QUESTION,
      voiceAnswer: DEFAULT_TTS_VOICE_ANSWER,
    }
  );
}

export function isTtsLangProfile(value: unknown): value is TtsLangProfile {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.model === "string" &&
    row.model.length > 0 &&
    typeof row.voiceQuestion === "string" &&
    row.voiceQuestion.length > 0 &&
    typeof row.voiceAnswer === "string" &&
    row.voiceAnswer.length > 0
  );
}

export function parseTtsProfiles(value: unknown): TtsProfiles {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const parsed: TtsProfiles = {};
  for (const [lang, profile] of Object.entries(value as Record<string, unknown>)) {
    if (isTtsLangProfile(profile)) parsed[lang] = profile;
  }
  return parsed;
}

const LEGACY_TTS_MODELS = new Set([
  "openai/tts-1-hd",
  "openai/tts-1",
  "tts-1-hd",
  "tts-1",
]);

const LEGACY_TTS_VOICES: Record<string, string> = {
  onyx: DEFAULT_TTS_VOICE_QUESTION,
  nova: DEFAULT_TTS_VOICE_ANSWER,
};

export function isLegacyTtsModel(model: string): boolean {
  return LEGACY_TTS_MODELS.has(model);
}

export function migrateTtsVoice(voice: string): string {
  return LEGACY_TTS_VOICES[voice] ?? voice;
}

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

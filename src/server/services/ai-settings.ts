import { Prisma } from "@prisma/client";
import { db } from "~/server/db";
import {
  APP_SETTINGS_ID,
  DEFAULT_CHAT_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_PROFILES,
  DEFAULT_TTS_VOICE_ANSWER,
  DEFAULT_TTS_VOICE_QUESTION,
  defaultTtsProfile,
  isLegacyTtsModel,
  migrateTtsVoice,
  parseTtsProfiles,
  type TtsLangProfile,
  type TtsProfiles,
} from "~/lib/ai-settings";
import { LEARNING_LANG_CODES } from "~/lib/languages";

export type AppAiSettings = {
  chatModel: string;
  embeddingModel: string;
  ttsProfiles: TtsProfiles;
};

function toSettings(
  chatModel: string,
  embeddingModel: string,
  ttsProfiles: TtsProfiles,
): AppAiSettings {
  return { chatModel, embeddingModel, ttsProfiles };
}

function mergeProfiles(
  stored: TtsProfiles,
  legacy?: { model: string; voiceQuestion: string; voiceAnswer: string },
): TtsProfiles {
  const merged: TtsProfiles = { ...DEFAULT_TTS_PROFILES };
  for (const lang of LEARNING_LANG_CODES) {
    if (stored[lang]) merged[lang] = stored[lang]!;
  }
  for (const [lang, profile] of Object.entries(stored)) {
    merged[lang] = profile;
  }
  if (legacy && Object.keys(stored).length === 0) {
    const seedLang = merged.en ? "en" : (LEARNING_LANG_CODES[0] ?? "en");
    merged[seedLang] = {
      model: isLegacyTtsModel(legacy.model) ? DEFAULT_TTS_MODEL : legacy.model,
      voiceQuestion: migrateTtsVoice(legacy.voiceQuestion),
      voiceAnswer: migrateTtsVoice(legacy.voiceAnswer),
    };
  }
  return merged;
}

export async function getAppSettings(): Promise<AppAiSettings> {
  const row = await db.appSettings.upsert({
    where: { id: APP_SETTINGS_ID },
    create: {
      id: APP_SETTINGS_ID,
      chatModel: DEFAULT_CHAT_MODEL,
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
      ttsModel: DEFAULT_TTS_MODEL,
      ttsVoiceQuestion: DEFAULT_TTS_VOICE_QUESTION,
      ttsVoiceAnswer: DEFAULT_TTS_VOICE_ANSWER,
      ttsProfiles: DEFAULT_TTS_PROFILES as Prisma.InputJsonValue,
    },
    update: {},
  });

  const stored = parseTtsProfiles(row.ttsProfiles);
  const ttsProfiles = mergeProfiles(stored, {
    model: row.ttsModel,
    voiceQuestion: row.ttsVoiceQuestion,
    voiceAnswer: row.ttsVoiceAnswer,
  });

  if (JSON.stringify(stored) !== JSON.stringify(ttsProfiles)) {
    const updated = await db.appSettings.update({
      where: { id: APP_SETTINGS_ID },
      data: { ttsProfiles: ttsProfiles as Prisma.InputJsonValue },
    });
    return toSettings(updated.chatModel, updated.embeddingModel, ttsProfiles);
  }

  return toSettings(row.chatModel, row.embeddingModel, ttsProfiles);
}

export async function updateAppSettings(patch: {
  chatModel?: string;
  embeddingModel?: string;
  ttsProfiles?: TtsProfiles;
}): Promise<AppAiSettings> {
  const current = await getAppSettings();
  const ttsProfiles = patch.ttsProfiles
    ? mergeProfiles(patch.ttsProfiles)
    : current.ttsProfiles;
  const row = await db.appSettings.update({
    where: { id: APP_SETTINGS_ID },
    data: {
      ...(patch.chatModel ? { chatModel: patch.chatModel } : {}),
      ...(patch.embeddingModel ? { embeddingModel: patch.embeddingModel } : {}),
      ttsProfiles: ttsProfiles as Prisma.InputJsonValue,
    },
  });
  return toSettings(row.chatModel, row.embeddingModel, ttsProfiles);
}

export async function getChatModel(): Promise<string> {
  return (await getAppSettings()).chatModel;
}

export async function getEmbeddingModel(): Promise<string> {
  return (await getAppSettings()).embeddingModel;
}

export async function getTtsSettings(lang?: string): Promise<TtsLangProfile> {
  const settings = await getAppSettings();
  if (lang && settings.ttsProfiles[lang]) {
    return settings.ttsProfiles[lang]!;
  }
  if (lang) return defaultTtsProfile(lang);
  return (
    settings.ttsProfiles.en ??
    Object.values(settings.ttsProfiles)[0] ??
    defaultTtsProfile("en")
  );
}

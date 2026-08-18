import { db } from "~/server/db";
import {
  APP_SETTINGS_ID,
  DEFAULT_CHAT_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE_ANSWER,
  DEFAULT_TTS_VOICE_QUESTION,
} from "~/lib/ai-settings";

export type AppAiSettings = {
  chatModel: string;
  embeddingModel: string;
  ttsModel: string;
  ttsVoiceQuestion: string;
  ttsVoiceAnswer: string;
};

const defaults: AppAiSettings = {
  chatModel: DEFAULT_CHAT_MODEL,
  embeddingModel: DEFAULT_EMBEDDING_MODEL,
  ttsModel: DEFAULT_TTS_MODEL,
  ttsVoiceQuestion: DEFAULT_TTS_VOICE_QUESTION,
  ttsVoiceAnswer: DEFAULT_TTS_VOICE_ANSWER,
};

export async function getAppSettings(): Promise<AppAiSettings> {
  const row = await db.appSettings.upsert({
    where: { id: APP_SETTINGS_ID },
    create: { id: APP_SETTINGS_ID, ...defaults },
    update: {},
  });
  return {
    chatModel: row.chatModel,
    embeddingModel: row.embeddingModel,
    ttsModel: row.ttsModel,
    ttsVoiceQuestion: row.ttsVoiceQuestion,
    ttsVoiceAnswer: row.ttsVoiceAnswer,
  };
}

export async function updateAppSettings(
  patch: Partial<AppAiSettings>,
): Promise<AppAiSettings> {
  await getAppSettings();
  const row = await db.appSettings.update({
    where: { id: APP_SETTINGS_ID },
    data: patch,
  });
  return {
    chatModel: row.chatModel,
    embeddingModel: row.embeddingModel,
    ttsModel: row.ttsModel,
    ttsVoiceQuestion: row.ttsVoiceQuestion,
    ttsVoiceAnswer: row.ttsVoiceAnswer,
  };
}

export async function getChatModel(): Promise<string> {
  return (await getAppSettings()).chatModel;
}

export async function getEmbeddingModel(): Promise<string> {
  return (await getAppSettings()).embeddingModel;
}

export async function getTtsSettings(): Promise<{
  model: string;
  voiceQuestion: string;
  voiceAnswer: string;
}> {
  const settings = await getAppSettings();
  return {
    model: settings.ttsModel,
    voiceQuestion: settings.ttsVoiceQuestion,
    voiceAnswer: settings.ttsVoiceAnswer,
  };
}

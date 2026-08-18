import { looksLikeQuestion } from "~/lib/satz-question";

export const TTS_MODEL = "tts-1-hd";
export const TTS_VOICE_QUESTION = "onyx";
export const TTS_VOICE_ANSWER = "nova";
export const LISTEN_PAUSE_MS = 1200;

export function voiceForSatz(mainText: string): "onyx" | "nova" {
  return looksLikeQuestion(mainText) ? TTS_VOICE_QUESTION : TTS_VOICE_ANSWER;
}

export function audioFileName(translationId: string): string {
  return `${translationId}.mp3`;
}

export function audioPublicPath(translationId: string): string {
  return `/api/audio/${translationId}`;
}

export function isAudioTranslationId(id: string): boolean {
  return /^[a-z0-9]{16,40}$/i.test(id);
}

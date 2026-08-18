import {
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE_ANSWER,
  DEFAULT_TTS_VOICE_QUESTION,
} from "~/lib/ai-settings";
import { looksLikeQuestion } from "~/lib/satz-question";

export const TTS_MODEL = DEFAULT_TTS_MODEL;
export const TTS_VOICE_QUESTION = DEFAULT_TTS_VOICE_QUESTION;
export const TTS_VOICE_ANSWER = DEFAULT_TTS_VOICE_ANSWER;
export const LISTEN_PAUSE_MS = 1200;

export function voiceForSatz(
  mainText: string,
  voices: { question: string; answer: string } = {
    question: TTS_VOICE_QUESTION,
    answer: TTS_VOICE_ANSWER,
  },
): string {
  return looksLikeQuestion(mainText) ? voices.question : voices.answer;
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

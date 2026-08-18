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

export function mainAudioFileName(satzId: string): string {
  return `main-${satzId}.mp3`;
}

export function audioPublicPath(translationId: string): string {
  return `/api/audio/${translationId}`;
}

export function mainAudioPublicPath(satzId: string): string {
  return `/api/audio/main/${satzId}`;
}

export function audioUrlWithVersion(
  url: string,
  updatedAt: Date | string | number,
): string {
  const stamp =
    updatedAt instanceof Date
      ? updatedAt.getTime()
      : typeof updatedAt === "number"
        ? updatedAt
        : new Date(updatedAt).getTime();
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${stamp}`;
}

export function isAudioTranslationId(id: string): boolean {
  return /^[a-z0-9]{16,40}$/i.test(id);
}

export type PlaybackClipKind = "main" | "translation";

export type PlaybackClip = {
  url: string;
  durationMs: number | null;
  kind: PlaybackClipKind;
};

export function playbackClips(params: {
  mainUrl?: string | null;
  mainStatus?: string | null;
  mainUpdatedAt?: Date | string | number;
  mainDurationMs?: number | null;
  translationUrl?: string | null;
  translationStatus?: string | null;
  translationUpdatedAt?: Date | string | number;
  translationDurationMs?: number | null;
}): PlaybackClip[] {
  const clips: PlaybackClip[] = [];
  if (params.mainStatus === "DONE" && params.mainUrl) {
    clips.push({
      url: params.mainUpdatedAt
        ? audioUrlWithVersion(params.mainUrl, params.mainUpdatedAt)
        : params.mainUrl,
      durationMs: params.mainDurationMs ?? null,
      kind: "main",
    });
  }
  if (params.translationStatus === "DONE" && params.translationUrl) {
    clips.push({
      url: params.translationUpdatedAt
        ? audioUrlWithVersion(params.translationUrl, params.translationUpdatedAt)
        : params.translationUrl,
      durationMs: params.translationDurationMs ?? null,
      kind: "translation",
    });
  }
  return clips;
}

export function clipsForListenPass<T extends { kind: PlaybackClipKind }>(
  clips: T[],
  playMain: boolean,
): T[] {
  if (playMain) return clips;
  const withoutMain = clips.filter((clip) => clip.kind !== "main");
  return withoutMain.length > 0 ? withoutMain : clips;
}

export function playbackUrls(params: {
  mainUrl?: string | null;
  mainStatus?: string | null;
  mainUpdatedAt?: Date | string | number;
  translationUrl?: string | null;
  translationStatus?: string | null;
  translationUpdatedAt?: Date | string | number;
}): string[] {
  return playbackClips(params).map((clip) => clip.url);
}

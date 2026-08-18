import { clipsForListenPass, type PlaybackClip } from "~/lib/satz-tts";
import type { SatzListenSettings } from "~/lib/satz-listen-settings";

export const FALLBACK_CLIP_MS = 2500;

export type ListenJob = {
  id: string;
  clips: PlaybackClip[];
};

export type ListenPlaylistItem = {
  itemId: string;
  sentenceKey: string;
  listRound: number;
  url: string;
  durationMs: number | null;
  pauseBeforeMs: number;
};

export function remainingListenMs(
  plan: Array<{ durationMs: number | null; pauseBeforeMs: number }>,
  done: number,
  playbackRate: number,
): number {
  const rest = plan.slice(Math.max(0, done - 1));
  if (rest.length === 0) return 0;
  const rate = playbackRate > 0 ? playbackRate : 1;
  return rest.reduce((sum, clip) => {
    const audioMs = (clip.durationMs ?? FALLBACK_CLIP_MS) / rate;
    return sum + clip.pauseBeforeMs + audioMs;
  }, 0);
}

export function playMainOnPass(
  settings: Pick<SatzListenSettings, "mainLangOnce">,
  listRound: number,
  repeat: number,
) {
  return !settings.mainLangOnce || (listRound === 0 && repeat === 0);
}

export function buildListenPlaylist(
  jobs: ListenJob[],
  settings: Pick<
    SatzListenSettings,
    "repeatsPerSentence" | "listRepeats" | "pauseMs" | "mainLangOnce"
  >,
): ListenPlaylistItem[] {
  const playlist: ListenPlaylistItem[] = [];
  for (let listRound = 0; listRound < settings.listRepeats; listRound++) {
    jobs.forEach((job, jobIndex) => {
      for (let repeat = 0; repeat < settings.repeatsPerSentence; repeat++) {
        const clips = clipsForListenPass(
          job.clips,
          playMainOnPass(settings, listRound, repeat),
        );
        clips.forEach((clip) => {
          playlist.push({
            itemId: job.id,
            sentenceKey: `${listRound}:${jobIndex}`,
            listRound,
            url: clip.url,
            durationMs: clip.durationMs,
            pauseBeforeMs: settings.pauseMs,
          });
        });
      }
    });
  }
  return playlist;
}

export function sentenceBounds(playlist: ListenPlaylistItem[], index: number) {
  const current = playlist[index];
  if (!current) {
    return {
      start: 0,
      prevStart: null as number | null,
      nextStart: null as number | null,
    };
  }
  const start = playlist.findIndex(
    (item) => item.sentenceKey === current.sentenceKey,
  );
  let prevStart: number | null = null;
  for (let i = start - 1; i >= 0; i -= 1) {
    if (playlist[i]!.sentenceKey !== current.sentenceKey) {
      const prevKey = playlist[i]!.sentenceKey;
      prevStart = playlist.findIndex((item) => item.sentenceKey === prevKey);
      break;
    }
  }
  const nextStart = playlist.findIndex(
    (item, itemIndex) =>
      itemIndex > index && item.sentenceKey !== current.sentenceKey,
  );
  return {
    start,
    prevStart,
    nextStart: nextStart === -1 ? null : nextStart,
  };
}

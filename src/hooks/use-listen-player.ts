"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "~/hooks/use-toast";
import { useTranslations } from "next-intl";
import {
  buildListenPlaylist,
  remainingListenMs,
  sentenceBounds,
  type ListenPlaylistItem,
} from "~/lib/listen-playlist";
import type { PlaybackClip } from "~/lib/satz-tts";
import {
  DEFAULT_SATZ_LISTEN_SETTINGS,
  loadSatzListenSettings,
  saveSatzListenSettings,
  type SatzListenSettings,
} from "~/lib/satz-listen-settings";
import { resolveErrorCode } from "~/lib/trpc-error";

export type ListenItem = {
  id: string;
  mainText: string;
  translationText?: string | null;
  extraText?: string | null;
  targetText?: string;
  nativeText?: string | null;
  questionText?: string | null;
  questionTranslation?: string | null;
  badges?: string[];
  clips: PlaybackClip[];
  audioStatus?: string;
};

export function listenTargetText(item: ListenItem): string {
  return item.targetText ?? item.mainText;
}

export function listenNativeText(item: ListenItem): string | null {
  return item.nativeText ?? item.translationText ?? null;
}

export function useListenPlayer({
  items,
  onFirstPassComplete,
}: {
  items: ListenItem[];
  onFirstPassComplete?: (ids: string[]) => void;
}) {
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();

  const [settings, setSettings] = useState<SatzListenSettings>(
    DEFAULT_SATZ_LISTEN_SETTINGS,
  );
  const [playlist, setPlaylist] = useState<ListenPlaylistItem[] | null>(null);
  const [clipIndex, setClipIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [awaitingNext, setAwaitingNext] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const practicedRef = useRef(false);
  const remainingUntilRef = useRef<number | null>(null);
  const frozenRemainingRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const settingsRef = useRef(settings);
  const runIdRef = useRef(0);
  settingsRef.current = settings;

  useEffect(() => {
    setSettings(loadSatzListenSettings());
  }, []);

  const updateSettings = (patch: Partial<SatzListenSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSatzListenSettings(next);
      return next;
    });
  };

  const readyItems = items.filter((item) => item.clips.length > 0);
  const sessionActive = playlist != null && playlist.length > 0;
  const currentClip = playlist?.[clipIndex] ?? null;
  const currentItem = currentClip
    ? items.find((item) => item.id === currentClip.itemId)
    : undefined;
  const currentItemId = currentItem?.id ?? null;

  const commitRemaining = (remainingMs: number) => {
    remainingUntilRef.current = Date.now() + remainingMs;
    frozenRemainingRef.current = remainingMs;
  };

  useEffect(() => {
    if (!sessionActive || paused) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sessionActive, paused]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = settings.playbackRate;
    }
  }, [settings.playbackRate]);

  const previewRemainingMs = useMemo(() => {
    if (readyItems.length === 0) return 0;
    const plan = buildListenPlaylist(
      readyItems.map((item) => ({ id: item.id, clips: item.clips })),
      settings,
    );
    return remainingListenMs(plan, 1, settings.playbackRate);
  }, [readyItems, settings]);

  const stopPlayback = () => {
    runIdRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    pausedRef.current = false;
    remainingUntilRef.current = null;
    frozenRemainingRef.current = null;
    setPaused(false);
    setAwaitingNext(false);
    setPlaylist(null);
    setClipIndex(0);
  };

  const startSession = (ids: string[]) => {
    const jobs = items
      .filter((item) => ids.includes(item.id) && item.clips.length > 0)
      .map((item) => ({ id: item.id, clips: item.clips }));
    const nextPlaylist = buildListenPlaylist(jobs, settings);
    if (nextPlaylist.length === 0) return;
    runIdRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    practicedRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    setAwaitingNext(false);
    setClipIndex(0);
    setPlaylist(nextPlaylist);
    commitRemaining(remainingListenMs(nextPlaylist, 1, settings.playbackRate));
  };

  const jumpTo = (index: number) => {
    if (!playlist) return;
    const nextIndex = Math.max(0, Math.min(index, playlist.length - 1));
    runIdRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    pausedRef.current = false;
    setPaused(false);
    setAwaitingNext(false);
    setClipIndex(nextIndex);
    commitRemaining(
      remainingListenMs(playlist, nextIndex + 1, settingsRef.current.playbackRate),
    );
  };

  const jumpToItem = (itemId: string) => {
    if (!playlist) return;
    const index = playlist.findIndex((clip) => clip.itemId === itemId);
    if (index >= 0) jumpTo(index);
  };

  const goPrevSentence = () => {
    if (!playlist) return;
    const bounds = sentenceBounds(playlist, clipIndex);
    jumpTo(bounds.prevStart ?? bounds.start);
  };

  const goNextSentence = () => {
    if (!playlist) return;
    const bounds = sentenceBounds(playlist, clipIndex);
    if (bounds.nextStart != null) {
      jumpTo(bounds.nextStart);
      return;
    }
    stopPlayback();
  };

  const repeatSentence = () => {
    if (!playlist) return;
    jumpTo(sentenceBounds(playlist, clipIndex).start);
  };

  const togglePause = () => {
    if (!sessionActive) return;
    if (awaitingNext) {
      goNextSentence();
      return;
    }
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (next) {
      audioRef.current?.pause();
      if (remainingUntilRef.current != null) {
        frozenRemainingRef.current = Math.max(
          0,
          remainingUntilRef.current - Date.now(),
        );
      }
      remainingUntilRef.current = null;
      return;
    }
    const leftover = frozenRemainingRef.current ?? 0;
    remainingUntilRef.current = Date.now() + leftover;
    if (audioRef.current && !audioRef.current.ended) {
      void audioRef.current.play().catch(() => undefined);
    }
  };

  useEffect(() => {
    if (!playlist || awaitingNext) return;
    const item = playlist[clipIndex];
    if (!item) {
      stopPlayback();
      return;
    }

    const runId = ++runIdRef.current;
    const controller = new AbortController();
    const still = () => runIdRef.current === runId && !controller.signal.aborted;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        if (controller.signal.aborted || ms <= 0) {
          resolve();
          return;
        }
        let left = ms;
        let last = Date.now();
        let timer = 0;
        const onAbort = () => {
          window.clearTimeout(timer);
          resolve();
        };
        controller.signal.addEventListener("abort", onAbort);
        const tick = () => {
          if (controller.signal.aborted) return;
          if (pausedRef.current) {
            last = Date.now();
            timer = window.setTimeout(tick, 50);
            return;
          }
          const now = Date.now();
          left -= now - last;
          last = now;
          if (left <= 0) {
            controller.signal.removeEventListener("abort", onAbort);
            resolve();
            return;
          }
          timer = window.setTimeout(tick, Math.min(50, left));
        };
        tick();
      });

    const playUrl = (url: string) =>
      new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        audio.playbackRate = settingsRef.current.playbackRate;
        audioRef.current = audio;
        const finish = () => {
          controller.signal.removeEventListener("abort", onAbort);
          resolve();
        };
        const onAbort = () => {
          audio.pause();
          finish();
        };
        controller.signal.addEventListener("abort", onAbort);
        audio.onended = finish;
        audio.onerror = () => {
          controller.signal.removeEventListener("abort", onAbort);
          reject(new Error("AUDIO_PLAY_FAILED"));
        };
        if (!still()) {
          finish();
          return;
        }
        void audio.play().catch(reject);
      });

    commitRemaining(
      remainingListenMs(playlist, clipIndex + 1, settingsRef.current.playbackRate),
    );

    void (async () => {
      try {
        await sleep(item.pauseBeforeMs);
        if (!still()) return;
        await playUrl(item.url);
        if (!still()) return;

        if (!practicedRef.current && item.listRound === 0) {
          let lastOfFirstPass = -1;
          for (let i = playlist.length - 1; i >= 0; i -= 1) {
            if (playlist[i]!.listRound === 0) {
              lastOfFirstPass = i;
              break;
            }
          }
          if (lastOfFirstPass === clipIndex) {
            practicedRef.current = true;
            onFirstPassComplete?.([
              ...new Set(playlist.map((clip) => clip.itemId)),
            ]);
          }
        }

        const nextIndex = clipIndex + 1;
        const nextItem = playlist[nextIndex];
        const lastOfSentence =
          !nextItem || nextItem.sentenceKey !== item.sentenceKey;
        if (lastOfSentence && !settingsRef.current.autoAdvance && nextItem) {
          const leftover = remainingListenMs(
            playlist,
            nextIndex + 1,
            settingsRef.current.playbackRate,
          );
          frozenRemainingRef.current = leftover;
          remainingUntilRef.current = null;
          setAwaitingNext(true);
          return;
        }
        if (!nextItem) {
          stopPlayback();
          return;
        }
        setClipIndex(nextIndex);
      } catch (error) {
        if (!still()) return;
        toast({
          title: tToasts("satzAudioPlayError"),
          description:
            error instanceof Error
              ? resolveErrorCode(error.message)
                ? tErrors(resolveErrorCode(error.message) as "NOT_FOUND")
                : error.message
              : undefined,
          variant: "destructive",
        });
        stopPlayback();
      }
    })();

    return () => {
      controller.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
    // Playlist index drives playback; pause is handled via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist, clipIndex, awaitingNext]);

  const bounds = playlist ? sentenceBounds(playlist, clipIndex) : null;
  const sessionRemainingMs = sessionActive
    ? paused || awaitingNext || remainingUntilRef.current == null
      ? (frozenRemainingRef.current ?? 0)
      : Math.max(0, remainingUntilRef.current - nowMs)
    : previewRemainingMs;
  const sessionTotalMs =
    playlist && playlist.length > 0
      ? remainingListenMs(playlist, 1, settings.playbackRate)
      : previewRemainingMs;

  return {
    settings,
    updateSettings,
    readyItems,
    sessionActive,
    playlist,
    clipIndex,
    currentClip,
    currentItem,
    currentItemId,
    paused,
    awaitingNext,
    bounds,
    sessionRemainingMs,
    sessionTotalMs,
    startSession,
    stopPlayback,
    jumpTo,
    jumpToItem,
    goPrevSentence,
    goNextSentence,
    repeatSentence,
    togglePause,
  };
}

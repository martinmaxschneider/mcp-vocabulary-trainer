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
import {
  buildListenTape,
  markerAtTime,
  type TapeMarker,
} from "~/lib/listen-tape";

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
  const [buffering, setBuffering] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const practicedRef = useRef(false);
  const remainingUntilRef = useRef<number | null>(null);
  const frozenRemainingRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const settingsRef = useRef(settings);
  const runIdRef = useRef(0);
  const preparedKeyRef = useRef("");
  const currentItemIdRef = useRef<string | null>(null);
  const playlistRef = useRef<ListenPlaylistItem[] | null>(null);
  const clipIndexRef = useRef(0);
  const tapeRef = useRef<{
    url: string;
    durationSec: number;
    markers: TapeMarker[];
  } | null>(null);
  const awaitingNextRef = useRef(false);
  const onEndedRef = useRef<() => void>(() => undefined);
  const onPlayErrorRef = useRef<(error: unknown) => void>(() => undefined);
  const onTimeRef = useRef<() => void>(() => undefined);
  settingsRef.current = settings;

  const ensureAudio = () => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.setAttribute("playsinline", "");
    audio.setAttribute("webkit-playsinline", "");
    audio.preload = "auto";
    audio.setAttribute("aria-hidden", "true");
    Object.assign(audio.style, {
      position: "absolute",
      width: "0",
      height: "0",
      opacity: "0",
      pointerEvents: "none",
    });
    const session = (
      navigator as Navigator & { audioSession?: { type: string } }
    ).audioSession;
    if (session) session.type = "playback";
    audio.onended = () => onEndedRef.current();
    audio.onerror = () =>
      onPlayErrorRef.current(new Error("AUDIO_PLAY_FAILED"));
    audio.ontimeupdate = () => onTimeRef.current();
    document.body.appendChild(audio);
    audioRef.current = audio;
    return audio;
  };

  const revokeTape = () => {
    if (!tapeRef.current) return;
    URL.revokeObjectURL(tapeRef.current.url);
    tapeRef.current = null;
  };

  const seekTapeToClip = (index: number) => {
    const tape = tapeRef.current;
    const audio = audioRef.current;
    const marker = tape?.markers.find((item) => item.clipIndex === index);
    if (!tape || !audio || !marker) return false;
    audio.currentTime = marker.startSec;
    clipIndexRef.current = index;
    setClipIndex(index);
    return true;
  };

  const maybeCompleteFirstPass = (finishedIndex: number) => {
    if (practicedRef.current) return;
    const list = playlistRef.current;
    const item = list?.[finishedIndex];
    if (!list || !item || item.listRound !== 0) return;
    let lastOfFirstPass = -1;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i]!.listRound === 0) {
        lastOfFirstPass = i;
        break;
      }
    }
    if (lastOfFirstPass !== finishedIndex) return;
    practicedRef.current = true;
    onFirstPassComplete?.([...new Set(list.map((clip) => clip.itemId))]);
  };

  const syncRemainingFromTape = () => {
    const tape = tapeRef.current;
    const audio = audioRef.current;
    const list = playlistRef.current;
    if (!tape || !audio || !list) return;
    const last = tape.markers[tape.markers.length - 1];
    const leftoverTapeMs =
      (Math.max(0, (Number.isFinite(audio.duration) ? audio.duration : tape.durationSec) -
        audio.currentTime) *
        1000) /
      settingsRef.current.playbackRate;
    const afterTape = last
      ? remainingListenMs(
          list,
          last.clipIndex + 1,
          settingsRef.current.playbackRate,
        )
      : 0;
    commitRemaining(leftoverTapeMs + afterTape);
  };

  const playTapeFrom = async (
    index: number,
    options?: { skipPause?: boolean },
  ) => {
    const list = playlistRef.current;
    if (!list?.[index]) return;
    const runId = ++runIdRef.current;
    const sentenceKey = list[index]!.sentenceKey;
    let end = list.length;
    if (!settingsRef.current.autoAdvance) {
      end = index + 1;
      while (end < list.length && list[end]!.sentenceKey === sentenceKey) {
        end += 1;
      }
    }
    const slice = list.slice(index, end);
    const audio = ensureAudio();
    setBuffering(true);
    try {
      const tape = await buildListenTape(
        slice.map((clip) => ({
          url: clip.url,
          pauseBeforeMs: clip.pauseBeforeMs,
        })),
        { skipFirstPause: options?.skipPause ?? false },
      );
      if (runId !== runIdRef.current) return;
      revokeTape();
      const url = URL.createObjectURL(tape.blob);
      tapeRef.current = {
        url,
        durationSec: tape.durationSec,
        markers: tape.markers.map((marker) => ({
          ...marker,
          clipIndex: marker.clipIndex + index,
        })),
      };
      audio.playbackRate = settingsRef.current.playbackRate;
      audio.src = url;
      if (pausedRef.current) return;
      await audio.play();
    } catch (error) {
      if (runId !== runIdRef.current) return;
      revokeTape();
      const clip = list[index];
      if (!clip) throw error;
      audio.playbackRate = settingsRef.current.playbackRate;
      audio.src = clip.url;
      if (pausedRef.current) return;
      await audio.play();
    } finally {
      if (runId === runIdRef.current) setBuffering(false);
    }
  };

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      audio?.pause();
      audio?.remove();
      audioRef.current = null;
      revokeTape();
    };
  }, []);

  useEffect(() => {
    const resumeIfNeeded = () => {
      if (pausedRef.current || awaitingNextRef.current) return;
      const audio = audioRef.current;
      if (!audio?.src || audio.ended) return;
      if (audio.paused) void audio.play().catch(() => undefined);
      syncRemainingFromTape();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (!pausedRef.current && audioRef.current?.paused === false) return;
        if (!pausedRef.current) {
          void audioRef.current?.play().catch(() => undefined);
        }
        return;
      }
      resumeIfNeeded();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", resumeIfNeeded);
    window.addEventListener("focus", resumeIfNeeded);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", resumeIfNeeded);
      window.removeEventListener("focus", resumeIfNeeded);
    };
  }, []);

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
  currentItemIdRef.current = currentItemId;

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

  const startSession = (
    ids: string[],
    options?: { paused?: boolean; resumeItemId?: string | null },
  ) => {
    const jobs = items
      .filter((item) => ids.includes(item.id) && item.clips.length > 0)
      .map((item) => ({ id: item.id, clips: item.clips }));
    const nextPlaylist = buildListenPlaylist(jobs, settingsRef.current);
    if (nextPlaylist.length === 0) return;
    const startPaused = options?.paused ?? false;
    let startIndex = 0;
    if (options?.resumeItemId) {
      const found = nextPlaylist.findIndex(
        (clip) => clip.itemId === options.resumeItemId,
      );
      if (found >= 0) startIndex = found;
    }
    const remaining = remainingListenMs(
      nextPlaylist,
      startIndex + 1,
      settingsRef.current.playbackRate,
    );
    runIdRef.current += 1;
    audioRef.current?.pause();
    revokeTape();
    if (audioRef.current) {
      audioRef.current.removeAttribute("src");
    }
    practicedRef.current = false;
    pausedRef.current = startPaused;
    setPaused(startPaused);
    awaitingNextRef.current = false;
    setAwaitingNext(false);
    clipIndexRef.current = startIndex;
    playlistRef.current = nextPlaylist;
    setClipIndex(startIndex);
    if (startPaused) {
      remainingUntilRef.current = null;
      frozenRemainingRef.current = remaining;
    } else {
      commitRemaining(remaining);
    }
    setPlaylist(nextPlaylist);
    if (!startPaused) {
      void playTapeFrom(startIndex, { skipPause: true }).catch((error) =>
        onPlayErrorRef.current(error),
      );
    }
  };

  const jumpTo = (index: number, options?: { paused?: boolean }) => {
    if (!playlist) return;
    const nextIndex = Math.max(0, Math.min(index, playlist.length - 1));
    const startPaused = options?.paused ?? false;
    const remaining = remainingListenMs(
      playlist,
      nextIndex + 1,
      settingsRef.current.playbackRate,
    );
    runIdRef.current += 1;
    audioRef.current?.pause();
    pausedRef.current = startPaused;
    setPaused(startPaused);
    awaitingNextRef.current = false;
    setAwaitingNext(false);
    clipIndexRef.current = nextIndex;
    setClipIndex(nextIndex);
    if (seekTapeToClip(nextIndex)) {
      if (!startPaused) void audioRef.current?.play().catch(() => undefined);
    } else {
      revokeTape();
      if (audioRef.current) audioRef.current.removeAttribute("src");
      if (!startPaused) {
        void playTapeFrom(nextIndex, { skipPause: true }).catch((error) =>
          onPlayErrorRef.current(error),
        );
      }
    }
    if (startPaused) {
      remainingUntilRef.current = null;
      frozenRemainingRef.current = remaining;
    } else {
      commitRemaining(remaining);
    }
  };

  const resetToStart = () => {
    if (playlist && playlist.length > 0) {
      jumpTo(0, { paused: true });
      return;
    }
    startSession(
      items.filter((item) => item.clips.length > 0).map((item) => item.id),
      { paused: true },
    );
  };

  const stopPlayback = () => {
    resetToStart();
  };

  const readyKey = readyItems.map((item) => item.id).join("\0");
  const structureKey = [
    settings.repeatsPerSentence,
    settings.listRepeats,
    settings.mainLangOnce ? 1 : 0,
    settings.pauseMs,
  ].join(":");
  useEffect(() => {
    const ids = readyKey.length > 0 ? readyKey.split("\0") : [];
    if (ids.length === 0) {
      if (preparedKeyRef.current === "") return;
      preparedKeyRef.current = "";
      runIdRef.current += 1;
      audioRef.current?.pause();
      pausedRef.current = true;
      remainingUntilRef.current = null;
      frozenRemainingRef.current = null;
      setPaused(true);
      awaitingNextRef.current = false;
      setAwaitingNext(false);
      setPlaylist(null);
      playlistRef.current = null;
      revokeTape();
      clipIndexRef.current = 0;
      setClipIndex(0);
      return;
    }
    const sameItems = preparedKeyRef.current === readyKey;
    preparedKeyRef.current = readyKey;
    startSession(ids, {
      paused: sameItems ? pausedRef.current : true,
      resumeItemId: sameItems ? currentItemIdRef.current : null,
    });
    // Rebuild when the item set or playlist-shaping settings change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyKey, structureKey]);

  const jumpToItem = (itemId: string, options?: { paused?: boolean }) => {
    if (!playlist) return;
    const index = playlist.findIndex((clip) => clip.itemId === itemId);
    if (index >= 0) jumpTo(index, options);
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
    jumpTo(0, { paused: true });
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
    const audio = ensureAudio();
    if (audio.src && !audio.ended && tapeRef.current) {
      void audio.play().catch(() => undefined);
      return;
    }
    void playTapeFrom(clipIndexRef.current, { skipPause: true }).catch((error) =>
      onPlayErrorRef.current(error),
    );
  };

  onPlayErrorRef.current = (error: unknown) => {
    if (pausedRef.current) return;
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
  };

  onTimeRef.current = () => {
    const tape = tapeRef.current;
    const audio = audioRef.current;
    if (!tape || !audio) return;
    if (!Number.isFinite(audio.currentTime)) return;
    const marker = markerAtTime(tape.markers, audio.currentTime);
    if (!marker) return;
    if (marker.clipIndex !== clipIndexRef.current) {
      const previous = clipIndexRef.current;
      clipIndexRef.current = marker.clipIndex;
      setClipIndex(marker.clipIndex);
      if (previous < marker.clipIndex) {
        maybeCompleteFirstPass(previous);
      }
      syncRemainingFromTape();
    }
    const session = navigator.mediaSession;
    if (!session || !Number.isFinite(audio.duration) || audio.duration <= 0) {
      return;
    }
    try {
      session.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate,
        position: audio.currentTime,
      });
    } catch {
      // iOS throws when duration is not ready yet.
    }
  };

  onEndedRef.current = () => {
    if (pausedRef.current) return;
    if (!audioRef.current?.src) return;
    const list = playlistRef.current;
    if (!list) return;
    const tape = tapeRef.current;
    const index = tape?.markers[tape.markers.length - 1]?.clipIndex
      ?? clipIndexRef.current;
    const item = list[index];
    if (!item) return;

    maybeCompleteFirstPass(index);
    clipIndexRef.current = index;
    setClipIndex(index);

    const nextIndex = index + 1;
    const nextItem = list[nextIndex];
    const lastOfSentence =
      !nextItem || nextItem.sentenceKey !== item.sentenceKey;
    if (lastOfSentence && !settingsRef.current.autoAdvance && nextItem) {
      const leftover = remainingListenMs(
        list,
        nextIndex + 1,
        settingsRef.current.playbackRate,
      );
      frozenRemainingRef.current = leftover;
      remainingUntilRef.current = null;
      awaitingNextRef.current = true;
      setAwaitingNext(true);
      return;
    }
    if (!nextItem) {
      stopPlayback();
      return;
    }
    clipIndexRef.current = nextIndex;
    setClipIndex(nextIndex);
    commitRemaining(
      remainingListenMs(list, nextIndex + 1, settingsRef.current.playbackRate),
    );
    void playTapeFrom(nextIndex).catch((error) =>
      onPlayErrorRef.current(error),
    );
  };

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!sessionActive) {
      navigator.mediaSession.playbackState = "none";
      navigator.mediaSession.metadata = null;
      return;
    }
    const title = currentItem
      ? listenTargetText(currentItem)
      : "Sprachen Daily";
    const artist = currentItem
      ? (listenNativeText(currentItem) ?? "Daily")
      : "Daily";
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: "Sprachen Daily",
      artwork: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    });
    navigator.mediaSession.playbackState = paused ? "paused" : "playing";
    navigator.mediaSession.setActionHandler("play", () => {
      if (pausedRef.current) togglePause();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      if (!pausedRef.current) togglePause();
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      goNextSentence();
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      goPrevSentence();
    });
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
    };
  }, [sessionActive, paused, currentItem]);

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
    buffering,
    bounds,
    sessionRemainingMs,
    sessionTotalMs,
    startSession,
    stopPlayback,
    resetToStart,
    jumpTo,
    jumpToItem,
    goPrevSentence,
    goNextSentence,
    repeatSentence,
    togglePause,
  };
}

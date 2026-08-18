"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Headphones, Loader2, Play, Settings, Volume2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { SatzListenPlayer } from "~/components/satz-listen-player";
import { useToast } from "~/hooks/use-toast";
import { formatListenRemaining } from "~/lib/audio-duration";
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
  SATZ_LISTEN_LIST_REPEAT_OPTIONS,
  SATZ_LISTEN_PAUSE_RANGE,
  SATZ_LISTEN_RATE_RANGE,
  SATZ_LISTEN_REPEAT_OPTIONS,
  type SatzListenSettings,
} from "~/lib/satz-listen-settings";
import { resolveErrorCode } from "~/lib/trpc-error";

export type ListenItem = {
  id: string;
  mainText: string;
  translationText?: string | null;
  extraText?: string | null;
  clips: PlaybackClip[];
  audioStatus?: string;
};

export function ListenSession({
  title,
  subtitle,
  items,
  filters,
  backHref,
  backLabel,
  generating,
  onGenerateMissing,
  onFirstPassComplete,
}: {
  title: string;
  subtitle?: string;
  items: ListenItem[];
  filters?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  generating?: boolean;
  onGenerateMissing?: () => void;
  onFirstPassComplete?: (ids: string[]) => void;
}) {
  const t = useTranslations("sentences");
  const tModes = useTranslations("practiceModes");
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

  return (
    <div className={`space-y-8 ${sessionActive ? "pb-36" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-2 text-4xl font-bold">{title}</h1>
          {subtitle ? (
            <p className="text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {backHref ? (
          <Button asChild variant="ghost">
            <Link href={backHref}>{backLabel ?? t("importBack")}</Link>
          </Button>
        ) : null}
      </div>

      {filters ? (
        <section className="cahier-card space-y-4 p-6">
          <h2 className="text-lg font-semibold">{t("listenFilters")}</h2>
          {filters}
        </section>
      ) : null}

      <section className="cahier-card space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-2xl font-semibold">
              <Headphones className="h-6 w-6" />
              {t("listenMode")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("listenReadyCount", {
                ready: readyItems.length,
                total: items.length,
              })}
              {readyItems.length > 0
                ? ` · ${t("listenEta", {
                    time: formatListenRemaining(sessionRemainingMs),
                  })}`
                : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onGenerateMissing ? (
              <Button
                type="button"
                variant="outline"
                disabled={generating || sessionActive}
                onClick={onGenerateMissing}
              >
                {generating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Volume2 className="mr-2 h-4 w-4" />
                )}
                {generating
                  ? tModes("generatingAudio")
                  : tModes("generateMissingAudio")}
              </Button>
            ) : null}
            <Button
              type="button"
              size="icon"
              variant={settings.settingsOpen ? "secondary" : "ghost"}
              className="h-11 w-11"
              aria-expanded={settings.settingsOpen}
              aria-label={t("listenSettings")}
              disabled={sessionActive}
              onClick={() =>
                updateSettings({ settingsOpen: !settings.settingsOpen })
              }
            >
              <Settings className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={readyItems.length === 0 || sessionActive}
              onClick={() => startSession(readyItems.map((item) => item.id))}
            >
              <Play className="mr-2 h-5 w-5" />
              {t("listenStart")}
            </Button>
          </div>
        </div>

        {settings.settingsOpen ? (
          <div className="space-y-4 border-t border-border/60 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="listen-pause">{t("listenPause")}</Label>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {(settings.pauseMs / 1000).toFixed(1)}s
                  </span>
                </div>
                <input
                  id="listen-pause"
                  type="range"
                  min={SATZ_LISTEN_PAUSE_RANGE.min / 1000}
                  max={SATZ_LISTEN_PAUSE_RANGE.max / 1000}
                  step={SATZ_LISTEN_PAUSE_RANGE.step / 1000}
                  value={settings.pauseMs / 1000}
                  onChange={(event) =>
                    updateSettings({
                      pauseMs: Math.round(Number(event.target.value) * 1000),
                    })
                  }
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="listen-speed">{t("listenSpeed")}</Label>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {settings.playbackRate.toFixed(2).replace(/\.?0+$/, "")}×
                  </span>
                </div>
                <input
                  id="listen-speed"
                  type="range"
                  min={SATZ_LISTEN_RATE_RANGE.min}
                  max={SATZ_LISTEN_RATE_RANGE.max}
                  step={SATZ_LISTEN_RATE_RANGE.step}
                  value={settings.playbackRate}
                  onChange={(event) =>
                    updateSettings({ playbackRate: Number(event.target.value) })
                  }
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("listenRepeatsSentence")}</Label>
                <Select
                  value={String(settings.repeatsPerSentence)}
                  onValueChange={(value) =>
                    updateSettings({ repeatsPerSentence: Number(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SATZ_LISTEN_REPEAT_OPTIONS.map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {value}×
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("listenRepeatsList")}</Label>
                <Select
                  value={String(settings.listRepeats)}
                  onValueChange={(value) =>
                    updateSettings({ listRepeats: Number(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SATZ_LISTEN_LIST_REPEAT_OPTIONS.map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {value}×
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("listenAdvance")}</Label>
                <Select
                  value={settings.autoAdvance ? "auto" : "manual"}
                  onValueChange={(value) =>
                    updateSettings({ autoAdvance: value === "auto" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t("listenAuto")}</SelectItem>
                    <SelectItem value="manual">{t("listenManual")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={settings.mainLangOnce}
                onCheckedChange={(checked) =>
                  updateSettings({ mainLangOnce: checked === true })
                }
              />
              <span className="space-y-0.5">
                <span className="block font-medium text-foreground">
                  {t("listenMainLangOnce")}
                </span>
                <span className="block text-muted-foreground">
                  {t("listenMainLangOnceHint")}
                </span>
              </span>
            </label>
          </div>
        ) : null}
      </section>

      {sessionActive && currentClip ? (
        <SatzListenPlayer
          mainText={currentItem?.mainText ?? ""}
          translationText={currentItem?.translationText}
          done={clipIndex + 1}
          total={playlist.length}
          remainingMs={sessionRemainingMs}
          totalMs={sessionTotalMs}
          paused={paused}
          awaitingNext={awaitingNext}
          canPrev={Boolean(
            bounds && (bounds.prevStart != null || clipIndex > bounds.start),
          )}
          canNext={
            Boolean(playlist && clipIndex < playlist.length - 1) || awaitingNext
          }
          onPrev={goPrevSentence}
          onNext={goNextSentence}
          onTogglePause={togglePause}
          onRepeat={repeatSentence}
          onClose={stopPlayback}
        />
      ) : null}
    </div>
  );
}

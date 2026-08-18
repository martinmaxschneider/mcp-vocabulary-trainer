"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AudioStatus, SatzPriority } from "@prisma/client";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";
import { formatListenRemaining } from "~/lib/audio-duration";
import { clipsForListenPass, playbackClips, playbackUrls } from "~/lib/satz-tts";
import { SatzListenPlayer } from "~/components/satz-listen-player";
import { useFocusLang } from "~/components/focus-lang-provider";
import { groupDomainsByKind } from "~/lib/domain-catalog";
import { MAX_BOX, MIN_BOX } from "~/lib/leitner";
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
import { Headphones, Pause, Play, Settings } from "lucide-react";

const FALLBACK_CLIP_MS = 2500;

function errorDescription(
  message: string,
  tErrors: (key: "NOT_FOUND") => string,
) {
  const code = resolveErrorCode(message);
  return code ? tErrors(code as "NOT_FOUND") : message;
}

function remainingListenMs(
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

type ListenAudioItem = {
  id: string;
  mainAudioUrl: string | null;
  mainAudioStatus: AudioStatus;
  mainAudioDurationMs?: number | null;
  updatedAt: Date | string;
  translations: Array<{
    lang: string;
    audioUrl: string | null;
    audioStatus: AudioStatus;
    audioDurationMs?: number | null;
    updatedAt: Date | string;
  }>;
  answerTo?: {
    mainAudioUrl: string | null;
    mainAudioStatus: AudioStatus;
    mainAudioDurationMs?: number | null;
    updatedAt: Date | string;
    translations: Array<{
      lang: string;
      audioUrl: string | null;
      audioStatus: AudioStatus;
      audioDurationMs?: number | null;
      updatedAt: Date | string;
    }>;
  } | null;
};

function buildListenJobs(
  items: ListenAudioItem[],
  satzIds: string[],
  focusLang: string,
) {
  return satzIds.flatMap((satzId) => {
    const satz = items.find((item) => item.id === satzId);
    if (!satz) return [];
    const answer = satz.translations.find((tr) => tr.lang === focusLang);
    const question = satz.answerTo?.translations.find(
      (tr) => tr.lang === focusLang,
    );
    const questionClips = satz.answerTo
      ? playbackClips({
          mainUrl: satz.answerTo.mainAudioUrl,
          mainStatus: satz.answerTo.mainAudioStatus,
          mainUpdatedAt: satz.answerTo.updatedAt,
          mainDurationMs: satz.answerTo.mainAudioDurationMs,
          translationUrl: question?.audioUrl,
          translationStatus: question?.audioStatus,
          translationUpdatedAt: question?.updatedAt,
          translationDurationMs: question?.audioDurationMs,
        })
      : [];
    const answerClips = playbackClips({
      mainUrl: satz.mainAudioUrl,
      mainStatus: satz.mainAudioStatus,
      mainUpdatedAt: satz.updatedAt,
      mainDurationMs: satz.mainAudioDurationMs,
      translationUrl: answer?.audioUrl,
      translationStatus: answer?.audioStatus,
      translationUpdatedAt: answer?.updatedAt,
      translationDurationMs: answer?.audioDurationMs,
    });
    const clips = [...questionClips, ...answerClips];
    return clips.length > 0 ? [{ satzId, clips }] : [];
  });
}

function playMainOnPass(
  settings: Pick<SatzListenSettings, "mainLangOnce">,
  listRound: number,
  repeat: number,
) {
  return !settings.mainLangOnce || (listRound === 0 && repeat === 0);
}

type ListenPlaylistItem = {
  satzId: string;
  sentenceKey: string;
  listRound: number;
  url: string;
  durationMs: number | null;
  pauseBeforeMs: number;
};

function buildListenPlaylist(
  jobs: ReturnType<typeof buildListenJobs>,
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
            satzId: job.satzId,
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

function sentenceBounds(playlist: ListenPlaylistItem[], index: number) {
  const current = playlist[index];
  if (!current) {
    return { start: 0, prevStart: null as number | null, nextStart: null as number | null };
  }
  const start = playlist.findIndex((item) => item.sentenceKey === current.sentenceKey);
  let prevStart: number | null = null;
  for (let i = start - 1; i >= 0; i -= 1) {
    if (playlist[i]!.sentenceKey !== current.sentenceKey) {
      const prevKey = playlist[i]!.sentenceKey;
      prevStart = playlist.findIndex((item) => item.sentenceKey === prevKey);
      break;
    }
  }
  const nextStart = playlist.findIndex(
    (item, itemIndex) => itemIndex > index && item.sentenceKey !== current.sentenceKey,
  );
  return {
    start,
    prevStart,
    nextStart: nextStart === -1 ? null : nextStart,
  };
}

const PRIORITIES: SatzPriority[] = [
  "DAILY",
  "WEEKLY",
  "OCCASIONAL",
  "RARE",
];

export function SatzListen() {
  const searchParams = useSearchParams();
  const idsParam = searchParams.get("ids");
  const ids = idsParam
    ? idsParam.split(",").map((id) => id.trim()).filter(Boolean)
    : undefined;

  const t = useTranslations("sentences");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const { focusLang } = useFocusLang();
  const utils = api.useUtils();

  const [domainId, setDomainId] = useState("all");
  const [priority, setPriority] = useState("all");
  const [box, setBox] = useState("all");
  const [settings, setSettings] = useState<SatzListenSettings>(
    DEFAULT_SATZ_LISTEN_SETTINGS,
  );

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

  const { data: domains } = api.domain.list.useQuery();
  const { data, isLoading } = api.satz.list.useQuery({
    ...(ids ? { ids } : {}),
    ...(!ids && domainId !== "all" ? { domainId } : {}),
    ...(!ids && priority !== "all" ? { priority: priority as SatzPriority } : {}),
    ...(!ids && box !== "all"
      ? { box: Number(box), targetLang: focusLang }
      : {}),
    limit: 200,
  });
  const items = data?.items ?? [];
  const themeDomains = useMemo(
    () =>
      groupDomainsByKind(
        (domains ?? []).filter(
          (d) => d.kind === "THEME" || d.kind === "SPECIAL",
        ),
      ).flatMap((group) => group.domains),
    [domains],
  );

  const [playlist, setPlaylist] = useState<ListenPlaylistItem[] | null>(null);
  const [clipIndex, setClipIndex] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
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

  const sessionActive = playlist != null && playlist.length > 0;
  const currentClip = playlist?.[clipIndex] ?? null;

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

  const markPracticed = api.satz.markPracticed.useMutation({
    onSuccess: () => {
      void utils.satz.list.invalidate();
    },
  });

  const readyItems = useMemo(() => {
    const linkedQuestionIds = new Set(
      items
        .map((satz) => satz.answerTo?.id)
        .filter((id): id is string => Boolean(id)),
    );
    return items.filter((satz) => {
      if (linkedQuestionIds.has(satz.id)) return false;
      const translation = satz.translations.find((tr) => tr.lang === focusLang);
      return translation?.audioStatus === AudioStatus.DONE && translation.audioUrl;
    });
  }, [items, focusLang]);

  const readyCount = readyItems.length;
  const previewRemainingMs = useMemo(() => {
    if (readyItems.length === 0) return 0;
    const jobs = buildListenJobs(
      readyItems,
      readyItems.map((satz) => satz.id),
      focusLang,
    );
    const plan = buildListenPlaylist(jobs, settings);
    return remainingListenMs(plan, 1, settings.playbackRate);
  }, [readyItems, focusLang, settings]);

  const stopPlayback = () => {
    runIdRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    pausedRef.current = false;
    remainingUntilRef.current = null;
    frozenRemainingRef.current = null;
    setPaused(false);
    setAwaitingNext(false);
    setPlayingId(null);
    setPlaylist(null);
    setClipIndex(0);
  };

  const startSession = (satzIds: string[]) => {
    const jobs = buildListenJobs(items, satzIds, focusLang);
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
    setPlayingId(nextPlaylist[0]!.satzId);
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
    setPlayingId(playlist[nextIndex]!.satzId);
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

    setPlayingId(item.satzId);
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
            markPracticed.mutate({
              satzIds: [...new Set(playlist.map((clip) => clip.satzId))],
            });
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
              ? errorDescription(error.message, tErrors)
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
  const currentSatz = currentClip
    ? items.find((item) => item.id === currentClip.satzId)
    : undefined;
  const currentTranslation = currentSatz?.translations.find(
    (tr) => tr.lang === focusLang,
  );
  const sessionRemainingMs = sessionActive
    ? paused || awaitingNext || remainingUntilRef.current == null
      ? (frozenRemainingRef.current ?? 0)
      : Math.max(0, remainingUntilRef.current - nowMs)
    : previewRemainingMs;
  const sessionTotalMs =
    playlist && playlist.length > 0
      ? remainingListenMs(playlist, 1, settings.playbackRate)
      : previewRemainingMs;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>;
  }

  return (
    <div className={`max-w-4xl space-y-8 ${sessionActive ? "pb-36" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-2 text-4xl font-bold">{t("listenTitle")}</h1>
          <p className="text-muted-foreground">{t("listenSubtitle")}</p>
        </div>
        <Button asChild variant="ghost">
          <Link href="/sentences">{t("importBack")}</Link>
        </Button>
      </div>

      {!ids ? (
        <section className="cahier-card space-y-4 p-6">
          <h2 className="text-lg font-semibold">{t("listenFilters")}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>{t("reviewFilterDomain")}</Label>
              <Select value={domainId} onValueChange={setDomainId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filterAllDomains")}</SelectItem>
                  {themeDomains.map((domain) => (
                    <SelectItem key={domain.id} value={domain.id}>
                      {domain.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("reviewFilterPriority")}</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filterAllPriorities")}</SelectItem>
                  {PRIORITIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`priority${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("reviewFilterBox")}</Label>
              <Select value={box} onValueChange={setBox}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filterAllBoxes")}</SelectItem>
                  {Array.from({ length: MAX_BOX - MIN_BOX + 1 }, (_, i) => {
                    const number = MIN_BOX + i;
                    return (
                      <SelectItem key={number} value={String(number)}>
                        {tCommon("box", { number })}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
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
              {t("listenReadyCount", { ready: readyCount, total: items.length })}
              {readyCount > 0
                ? ` · ${t("listenEta", {
                    time: formatListenRemaining(sessionRemainingMs),
                  })}`
                : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
              disabled={readyCount === 0 || sessionActive}
              onClick={() => startSession(readyItems.map((satz) => satz.id))}
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

      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyDesc")}</p>
        ) : (
          items.map((satz) => {
            const translation = satz.translations.find(
              (tr) => tr.lang === focusLang,
            );
            const status = translation?.audioStatus ?? AudioStatus.NONE;
            const canPlay =
              playbackUrls({
                mainUrl: satz.mainAudioUrl,
                mainStatus: satz.mainAudioStatus,
                mainUpdatedAt: satz.updatedAt,
                translationUrl: translation?.audioUrl,
                translationStatus: status,
                translationUpdatedAt: translation?.updatedAt,
              }).length > 0;
            const isCurrent = playingId === satz.id;
            return (
              <div
                key={satz.id}
                className={`cahier-item space-y-2 p-4 ${isCurrent ? "cahier-item-selected" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{satz.mainText}</p>
                    {translation ? (
                      <p className="text-sm text-muted-foreground">
                        {translation.text}
                      </p>
                    ) : null}
                    {satz.answerTo ? (
                      <p className="text-sm text-muted-foreground">
                        {t("answerToPrefix")}: {satz.answerTo.mainText}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{t(`audioStatus${status}`)}</Badge>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/sentences/${satz.id}/train`}>{t("train")}</Link>
                    </Button>
                    {canPlay ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          isCurrent ? stopPlayback() : startSession([satz.id])
                        }
                        disabled={sessionActive && !isCurrent}
                      >
                        {isCurrent ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {sessionActive && currentClip ? (
        <SatzListenPlayer
          mainText={currentSatz?.mainText ?? ""}
          translationText={currentTranslation?.text}
          done={clipIndex + 1}
          total={playlist.length}
          remainingMs={sessionRemainingMs}
          totalMs={sessionTotalMs}
          paused={paused}
          awaitingNext={awaitingNext}
          canPrev={Boolean(bounds && (bounds.prevStart != null || clipIndex > bounds.start))}
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

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Headphones, Pause, Play, Settings } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { SatzListenPlayer } from "~/components/satz-listen-player";
import { formatListenRemaining } from "~/lib/audio-duration";
import { clipsForListenPass, type PlaybackClip } from "~/lib/satz-tts";
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

const FALLBACK_CLIP_MS = 2500;

export type ListenItem = {
  id: string;
  mainText: string;
  translationText?: string | null;
  clips: PlaybackClip[];
};

export function ListenSession({
  title,
  subtitle,
  items,
  filters,
}: {
  title: string;
  subtitle?: string;
  items: ListenItem[];
  filters?: React.ReactNode;
}) {
  const t = useTranslations("sentences");
  const tModes = useTranslations("practiceModes");
  const [settings, setSettings] = useState<SatzListenSettings>(
    DEFAULT_SATZ_LISTEN_SETTINGS,
  );
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [index, setIndex] = useState(0);
  const [pass, setPass] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopRef = useRef(false);

  useEffect(() => {
    setSettings(loadSatzListenSettings());
  }, []);

  useEffect(() => {
    saveSatzListenSettings(settings);
  }, [settings]);

  const readyItems = items.filter((item) => item.clips.length > 0);
  const current = readyItems[index];

  const playQueue = useMemo(() => {
    if (!current) return [];
    const clips = clipsForListenPass(
      current.clips,
      pass === 0 || !settings.mainLangOnce,
    );
    return Array.from({ length: settings.repeatsPerSentence }, () => clips).flat();
  }, [current, pass, settings.mainLangOnce, settings.repeatsPerSentence]);

  const remainingMs = playQueue.reduce((sum, clip) => {
    return sum + settings.pauseMs + (clip.durationMs ?? FALLBACK_CLIP_MS);
  }, 0);

  const stop = () => {
    stopRef.current = true;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
    setPaused(false);
  };

  const playUrl = (src: string) =>
    new Promise<void>((resolve, reject) => {
      const audio = new Audio(src);
      audio.playbackRate = settings.playbackRate;
      audioRef.current = audio;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("AUDIO_PLAY_FAILED"));
      void audio.play().catch(reject);
    });

  const playCurrent = async () => {
    stopRef.current = false;
    setPlaying(true);
    setPaused(false);
    try {
      for (const clip of playQueue) {
        if (stopRef.current) return;
        if (settings.pauseMs > 0) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, settings.pauseMs);
          });
        }
        if (stopRef.current) return;
        await playUrl(clip.url);
      }
      if (!settings.autoAdvance || stopRef.current) return;
      const nextIndex = index + 1;
      if (nextIndex < readyItems.length) {
        setIndex(nextIndex);
        setPass((p) => (settings.mainLangOnce ? p + 1 : p));
      } else if (pass + 1 < settings.listRepeats) {
        setIndex(0);
        setPass((p) => p + 1);
      } else {
        stop();
      }
    } catch {
      stop();
    }
  };

  useEffect(() => {
    if (playing && !paused && current) {
      void playCurrent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, pass, playing]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-4xl font-bold">{title}</h1>
        {subtitle ? <p className="text-muted-foreground">{subtitle}</p> : null}
      </header>

      {filters}

      <section className="cahier-card space-y-4 p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {readyItems.length} / {items.length}
          </p>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() =>
              setSettings((prev) => ({
                ...prev,
                settingsOpen: !prev.settingsOpen,
              }))
            }
            aria-label={tModes("listen")}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {settings.settingsOpen ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{t("listenPause")}</Label>
              <input
                type="range"
                min={SATZ_LISTEN_PAUSE_RANGE.min}
                max={SATZ_LISTEN_PAUSE_RANGE.max}
                step={SATZ_LISTEN_PAUSE_RANGE.step}
                value={settings.pauseMs}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    pauseMs: Number(e.target.value),
                  }))
                }
                className="w-full"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("listenSpeed")}</Label>
              <input
                type="range"
                min={SATZ_LISTEN_RATE_RANGE.min}
                max={SATZ_LISTEN_RATE_RANGE.max}
                step={SATZ_LISTEN_RATE_RANGE.step}
                value={settings.playbackRate}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    playbackRate: Number(e.target.value),
                  }))
                }
                className="w-full"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("listenRepeatsSentence")}</Label>
              <div className="flex gap-2">
                {SATZ_LISTEN_REPEAT_OPTIONS.map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant={settings.repeatsPerSentence === n ? "default" : "outline"}
                    onClick={() =>
                      setSettings((prev) => ({ ...prev, repeatsPerSentence: n }))
                    }
                  >
                    {n}×
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t("listenRepeatsList")}</Label>
              <div className="flex gap-2">
                {SATZ_LISTEN_LIST_REPEAT_OPTIONS.map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant={settings.listRepeats === n ? "default" : "outline"}
                    onClick={() =>
                      setSettings((prev) => ({ ...prev, listRepeats: n }))
                    }
                  >
                    {n}×
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {!playing ? (
          <Button
            type="button"
            size="lg"
            disabled={readyItems.length === 0}
            onClick={() => {
              setIndex(0);
              setPass(0);
              setPlaying(true);
            }}
            className="bg-[#1e3a5f] text-white hover:bg-[#16304d]"
          >
            <Play className="mr-2 h-4 w-4" />
            {t("listenStart")}
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={stop}>
            <Pause className="mr-2 h-4 w-4" />
            {t("listenPlayerPause")}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          <Headphones className="mr-1 inline h-3 w-3" />
          {formatListenRemaining(remainingMs)}
        </p>
      </section>

      {playing && current ? (
        <SatzListenPlayer
          mainText={current.mainText}
          translationText={current.translationText}
          done={index + 1}
          total={readyItems.length}
          remainingMs={remainingMs}
          totalMs={remainingMs}
          paused={paused}
          awaitingNext={false}
          canPrev={index > 0}
          canNext={index < readyItems.length - 1}
          onPrev={() => setIndex((i) => Math.max(0, i - 1))}
          onNext={() => setIndex((i) => Math.min(readyItems.length - 1, i + 1))}
          onTogglePause={() => {
            setPaused((p) => {
              const next = !p;
              if (next) audioRef.current?.pause();
              else void audioRef.current?.play();
              return next;
            });
          }}
          onRepeat={() => void playCurrent()}
          onClose={stop}
        />
      ) : null}
    </div>
  );
}

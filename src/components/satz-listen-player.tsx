"use client";

import { useTranslations } from "next-intl";
import {
  Headphones,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { formatListenClock } from "~/lib/audio-duration";
import { Button } from "~/components/ui/button";

type SatzListenPlayerProps = {
  mainText: string;
  translationText?: string | null;
  done: number;
  total: number;
  remainingMs: number;
  totalMs: number;
  paused: boolean;
  awaitingNext: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onTogglePause: () => void;
  onRepeat: () => void;
  onClose: () => void;
};

export function SatzListenPlayer({
  mainText,
  translationText,
  done,
  total,
  remainingMs,
  totalMs,
  paused,
  awaitingNext,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onTogglePause,
  onRepeat,
  onClose,
}: SatzListenPlayerProps) {
  const t = useTranslations("sentences");
  const percent =
    totalMs > 0
      ? Math.min(100, Math.max(0, ((totalMs - remainingMs) / totalMs) * 100))
      : 0;
  const waiting = awaitingNext && !paused;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
      <div className="pointer-events-auto relative mx-auto max-w-3xl overflow-hidden rounded-3xl border border-border/70 bg-[var(--cahier-paper,#fff)] text-[var(--cahier-ink,#1e3a5f)] shadow-[0_18px_50px_rgba(30,58,95,0.22)]">
        <div className="absolute bottom-3 left-5 top-3 w-0.5 rounded-full bg-[var(--cahier-red,#d45d5d)]" />

        <div className="flex flex-col gap-4 px-6 py-4 pl-9 sm:flex-row sm:items-center sm:gap-6">
          <div className="min-w-0 flex-1">
            <p className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Headphones className="h-3.5 w-3.5" />
              {t("listenNowPlaying")}
              <span className="tabular-nums text-[var(--cahier-red,#d45d5d)]">
                {done} / {total}
              </span>
            </p>
            <p className="truncate text-lg font-semibold leading-tight">{mainText}</p>
            {translationText ? (
              <p className="truncate text-sm text-muted-foreground">{translationText}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-center gap-1.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-11 w-11 rounded-full"
              disabled={!canPrev}
              onClick={onPrev}
              aria-label={t("listenPlayerPrev")}
            >
              <SkipBack className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-11 w-11 rounded-full"
              onClick={onRepeat}
              aria-label={t("listenPlayerRepeat")}
            >
              <Repeat className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              size="icon"
              className={`h-14 w-14 rounded-full shadow-lg ${
                waiting ? "animate-pulse" : ""
              }`}
              onClick={waiting ? onNext : onTogglePause}
              aria-label={
                waiting
                  ? t("listenPlayerNext")
                  : paused
                    ? t("listenPlayerPlay")
                    : t("listenPlayerPause")
              }
            >
              {paused || waiting ? (
                <Play className="h-6 w-6 fill-current" />
              ) : (
                <Pause className="h-6 w-6 fill-current" />
              )}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-11 w-11 rounded-full"
              disabled={!canNext}
              onClick={onNext}
              aria-label={t("listenPlayerNext")}
            >
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <div className="min-w-[4.5rem] text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("listenPlayerLeft")}
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums leading-none">
                {formatListenClock(remainingMs)}
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-full"
              onClick={onClose}
              aria-label={t("listenPlayerClose")}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div
          className="h-1 bg-[var(--cahier-ink,#1e3a5f)]/8 dark:bg-white/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
        >
          <div
            className="h-full bg-[var(--cahier-red,#d45d5d)]/80 transition-[width] duration-700 ease-linear"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

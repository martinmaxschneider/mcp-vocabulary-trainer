"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Libre_Baskerville } from "next/font/google";
import {
  Headphones,
  Pause,
  Play,
  Repeat,
  Settings,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  X,
} from "lucide-react";
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
import { Badge } from "~/components/ui/badge";
import { formatListenClock } from "~/lib/audio-duration";
import {
  SATZ_LISTEN_LIST_REPEAT_OPTIONS,
  SATZ_LISTEN_PAUSE_RANGE,
  SATZ_LISTEN_RATE_RANGE,
  SATZ_LISTEN_REPEAT_OPTIONS,
} from "~/lib/satz-listen-settings";
import {
  listenNativeText,
  listenTargetText,
  useListenPlayer,
  type ListenItem,
} from "~/hooks/use-listen-player";
import { cn } from "~/lib/utils";

export type { ListenItem };

const libreBaskerville = Libre_Baskerville({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

export function ListenSession({
  title,
  subtitle,
  items,
  filters,
  backHref,
  backLabel,
  onFirstPassComplete,
  actions,
  compact = false,
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
  actions?: React.ReactNode;
  compact?: boolean;
}) {
  const t = useTranslations("sentences");
  const player = useListenPlayer({ items, onFirstPassComplete });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(!compact);
  const activeRowRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!queueOpen) return;
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [player.currentItemId, queueOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === " " || event.key === "k") {
        event.preventDefault();
        if (player.awaitingNext) player.goNextSentence();
        else player.togglePause();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        player.goNextSentence();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        player.goPrevSentence();
        return;
      }
      if (event.key === "r") {
        event.preventDefault();
        player.repeatSentence();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    player.togglePause,
    player.goNextSentence,
    player.goPrevSentence,
    player.repeatSentence,
    player.awaitingNext,
  ]);

  const displayItem = player.currentItem ?? items[0] ?? null;
  const currentTarget = displayItem ? listenTargetText(displayItem) : "";
  const currentNative = displayItem ? listenNativeText(displayItem) : null;

  const queueItems = useMemo(() => {
    const source = player.playlist
      ? (() => {
          const seen = new Set<string>();
          const ordered: ListenItem[] = [];
          for (const clip of player.playlist) {
            if (seen.has(clip.itemId)) continue;
            seen.add(clip.itemId);
            const item = items.find((entry) => entry.id === clip.itemId);
            if (item) ordered.push(item);
          }
          return ordered;
        })()
      : items;
    return source;
  }, [player.playlist, items]);

  const currentQueueIndex = queueItems.findIndex(
    (item) => item.id === (player.currentItemId ?? displayItem?.id),
  );

  const canPrev = Boolean(
    player.bounds &&
      (player.bounds.prevStart != null ||
        player.clipIndex > player.bounds.start),
  );
  const canNext = Boolean(
    player.playlist && player.clipIndex < player.playlist.length - 1,
  );
  const waiting = player.awaitingNext && !player.paused;
  const canPlay = player.readyItems.length > 0;
  const percent =
    player.sessionTotalMs > 0
      ? Math.min(
          100,
          Math.max(
            0,
            ((player.sessionTotalMs - player.sessionRemainingMs) /
              player.sessionTotalMs) *
              100,
          ),
        )
      : 0;

  const toggleSettings = () => {
    setSettingsOpen((open) => !open);
  };

  const clipTotal = player.playlist?.length ?? 0;
  const clipDone = clipTotal > 0 ? player.clipIndex + 1 : 0;

  return (
    <div className={compact ? "space-y-0" : "space-y-8"}>
      {compact ? null : (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="mb-2 text-4xl font-bold">{title}</h1>
            {subtitle ? (
              <p className="text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {backHref ? (
              <Button asChild variant="ghost">
                <Link href={backHref}>{backLabel ?? t("importBack")}</Link>
              </Button>
            ) : null}
            {actions}
          </div>
        </div>
      )}

      <section className={cn("overflow-hidden", compact ? "" : "cahier-card")}>
        <div className={cn("space-y-6", compact ? "p-4" : "p-6 sm:p-10")}>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#3d4f66]">
            <span className="flex items-center gap-2 font-semibold uppercase tracking-[0.16em]">
              <Headphones className="h-4 w-4" />
              {t("listenNowPlaying")}
              <span className="tabular-nums text-[var(--cahier-red,#d45d5d)]">
                {clipDone} / {clipTotal}
              </span>
            </span>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#3d4f66]">
                  {t("listenPlayerLeft")}
                </p>
                <p className="font-mono text-2xl font-semibold tabular-nums leading-none text-[#1e3a5f]">
                  {formatListenClock(player.sessionRemainingMs)}
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className={cn(
                  "h-8 w-8 rounded-full text-[#3d4f66]",
                  settingsOpen ? "bg-[#1e3a5f]/8 text-[#1e3a5f]" : "",
                )}
                aria-expanded={settingsOpen}
                aria-label={t("listenSettings")}
                onClick={toggleSettings}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className={settingsOpen ? "invisible" : undefined}>
              {displayItem?.badges && displayItem.badges.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {displayItem.badges.map((badge) => (
                    <Badge key={badge} variant="outline">
                      {badge}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {displayItem ? (
                <div
                  className={cn(
                    "flex flex-col gap-4",
                    compact
                      ? "min-h-[8.5rem]"
                      : "min-h-[13.5rem] sm:min-h-[16rem]",
                    displayItem.questionText
                      ? "justify-start"
                      : "justify-center",
                  )}
                >
                  {displayItem.questionText ? (
                    <div className="max-w-[85%] rounded-xl border border-[#3d4f66]/35 bg-[#3d4f66]/10 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#3d4f66]">
                        {t("listenIntro")}
                      </p>
                      {displayItem.questionTranslation ? (
                        <p className="mt-1.5 text-sm font-medium text-orange-500/80">
                          {displayItem.questionTranslation}
                        </p>
                      ) : null}
                      <p className="mt-1 text-base font-medium leading-snug text-[#1e3a5f]">
                        {displayItem.questionText}
                      </p>
                    </div>
                  ) : null}
                  <div>
                    {currentNative ? (
                      <p
                        className={cn(
                          "mb-2 font-medium text-orange-500/80",
                          compact ? "text-base" : "text-lg sm:text-xl",
                        )}
                      >
                        {currentNative}
                      </p>
                    ) : null}
                    <p
                      className={cn(
                        "font-semibold leading-snug text-[#1e3a5f]",
                        compact ? "text-2xl" : "text-3xl sm:text-5xl",
                        libreBaskerville.className,
                      )}
                    >
                      {currentTarget}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-lg text-[#3d4f66]">
                  {t("listenReadyCount", { ready: 0, total: 0 })}
                </p>
              )}

              <div className="flex items-center justify-center gap-1.5 border-t border-border/60 pt-5 [touch-action:manipulation]">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-12 w-12 rounded-full"
                  disabled={!canPrev}
                  onClick={player.goPrevSentence}
                  aria-label={t("listenPlayerPrev")}
                >
                  <SkipBack className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-12 w-12 rounded-full"
                  disabled={!canPlay}
                  onClick={player.repeatSentence}
                  aria-label={t("listenPlayerRepeat")}
                >
                  <Repeat className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  className={`rounded-full shadow-lg ${
                    compact ? "h-16 w-16" : "h-14 w-14"
                  } ${waiting ? "animate-pulse" : ""}`}
                  disabled={!canPlay}
                  onClick={
                    waiting ? player.goNextSentence : player.togglePause
                  }
                  aria-label={
                    waiting
                      ? t("listenPlayerNext")
                      : player.paused || !player.sessionActive
                        ? t("listenPlayerPlay")
                        : t("listenPlayerPause")
                  }
                >
                  {player.paused || waiting || !player.sessionActive ? (
                    <Play className="h-6 w-6 fill-current" />
                  ) : (
                    <Pause className="h-6 w-6 fill-current" />
                  )}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-12 w-12 rounded-full"
                  disabled={!canNext && !player.awaitingNext}
                  onClick={player.goNextSentence}
                  aria-label={t("listenPlayerNext")}
                >
                  <SkipForward className="h-5 w-5" />
                </Button>
              </div>
            </div>
            {settingsOpen ? (
              <div className="absolute inset-0 overflow-y-auto">
                <ListenSettings
                  settings={player.settings}
                  updateSettings={player.updateSettings}
                />
              </div>
            ) : null}
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

        <div className="border-t border-border/60">
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 py-3",
              compact ? "px-4" : "px-6 sm:px-10",
            )}
          >
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#3d4f66]">
              {t("listenQueue")}
              <span className="tabular-nums text-[var(--cahier-red,#d45d5d)]">
                {currentQueueIndex >= 0 ? currentQueueIndex + 1 : 0} /{" "}
                {queueItems.length}
              </span>
            </span>
            <div className="flex items-center gap-2">
              {filters ? (
                <div className="flex flex-wrap items-center gap-2">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-[#3d4f66]" />
                  {filters}
                </div>
              ) : null}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-full text-[#3d4f66]"
                aria-expanded={queueOpen}
                aria-label={t("listenQueue")}
                onClick={() => setQueueOpen((open) => !open)}
              >
                <X
                  className={cn(
                    "h-4 w-4 transition-transform",
                    queueOpen ? "rotate-0" : "rotate-45",
                  )}
                />
              </Button>
            </div>
          </div>
          {queueOpen ? (
            <ul
              className={cn(
                "space-y-1 overflow-y-auto border-t border-border/60 pb-4 pt-2",
                compact
                  ? "max-h-48 px-4 pr-5"
                  : "max-h-80 px-6 pr-7 sm:px-10 sm:pr-11",
              )}
            >
              {queueItems.map((item, index) => {
                const active =
                  item.id === (player.currentItemId ?? displayItem?.id);
                const past =
                  currentQueueIndex >= 0 && index < currentQueueIndex;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      ref={active ? activeRowRef : undefined}
                      onClick={() =>
                        player.jumpToItem(item.id, { paused: player.paused })
                      }
                      disabled={!player.sessionActive}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg border-2 px-3 py-2 text-left transition-colors",
                        active
                          ? "border-[#1e3a5f] bg-[#1e3a5f]/10"
                          : "border-transparent hover:bg-muted/60",
                        past && !active ? "opacity-50" : "",
                      )}
                    >
                      <span className="w-6 shrink-0 pt-0.5 text-xs tabular-nums text-[#3d4f66]">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-[#1e3a5f]">
                          {listenTargetText(item)}
                        </span>
                        {listenNativeText(item) ? (
                          <span className="mt-0.5 block truncate text-sm text-[#3d4f66]">
                            {listenNativeText(item)}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ListenSettings({
  settings,
  updateSettings,
}: {
  settings: ReturnType<typeof useListenPlayer>["settings"];
  updateSettings: ReturnType<typeof useListenPlayer>["updateSettings"];
}) {
  const t = useTranslations("sentences");
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="listen-pause">{t("listenPause")}</Label>
            <span className="text-sm tabular-nums text-[#3d4f66]">
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
            <span className="text-sm tabular-nums text-[#3d4f66]">
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
          <span className="block font-medium text-[#1e3a5f]">
            {t("listenMainLangOnce")}
          </span>
          <span className="block text-[#3d4f66]">
            {t("listenMainLangOnceHint")}
          </span>
        </span>
      </label>
    </div>
  );
}

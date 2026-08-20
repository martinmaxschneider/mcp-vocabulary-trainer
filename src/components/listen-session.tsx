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
  settingsExtra,
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
  settingsExtra?: React.ReactNode;
}) {
  const t = useTranslations("sentences");
  const player = useListenPlayer({ items, onFirstPassComplete });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(true);
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
    <div className="space-y-8">
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

      <section className="cahier-card overflow-hidden">
        <div className="space-y-6 p-6 sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#3d4f66]">
            <span className="flex items-center gap-2 font-semibold uppercase tracking-[0.16em]">
              <Headphones className="h-4 w-4" />
              {t("listenNowPlaying")}
              <span className="tabular-nums text-[var(--cahier-red,#d45d5d)]">
                {clipDone} / {clipTotal}
              </span>
            </span>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#3d4f66]">
                {t("listenPlayerLeft")}
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums leading-none text-[#1e3a5f]">
                {formatListenClock(player.sessionRemainingMs)}
              </p>
            </div>
          </div>

          <div>
            <div className="relative">
              <div className={cn(settingsOpen && "invisible")}>
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
                      "flex min-h-[13.5rem] flex-col gap-4 sm:min-h-[16rem]",
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
                        <p className="mb-2 text-lg font-medium text-orange-500/80 sm:text-xl">
                          {currentNative}
                        </p>
                      ) : null}
                      <p
                        className={cn(
                          "text-3xl font-semibold leading-snug text-[#1e3a5f] sm:text-5xl",
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
              </div>
              {settingsOpen ? (
                <div className="absolute inset-0 overflow-y-auto">
                  <ListenSettings
                    settings={player.settings}
                    updateSettings={player.updateSettings}
                    extra={settingsExtra}
                  />
                </div>
              ) : null}
            </div>

            <ListenTransportControls
              canPlay={canPlay}
              canPrev={canPrev}
              canNext={canNext}
              waiting={waiting}
              buffering={player.buffering}
              awaitingNext={player.awaitingNext}
              paused={player.paused}
              sessionActive={player.sessionActive}
              settingsOpen={settingsOpen}
              onRepeat={player.repeatSentence}
              onPrev={player.goPrevSentence}
              onToggle={waiting ? player.goNextSentence : player.togglePause}
              onNext={player.goNextSentence}
              onSettings={toggleSettings}
            />
          </div>
        </div>

        <div>
          <ListenProgress percent={percent} />
          <div className="border-t border-border/60">
            <ListenQueueHeader
              currentIndex={currentQueueIndex}
              total={queueItems.length}
              filters={filters}
              open={queueOpen}
              onToggle={() => setQueueOpen((open) => !open)}
            />
            {queueOpen ? (
              <ListenQueueList
                items={queueItems}
                currentItemId={player.currentItemId ?? displayItem?.id}
                currentIndex={currentQueueIndex}
                sessionActive={player.sessionActive}
                activeRowRef={activeRowRef}
                onJump={(id) =>
                  player.jumpToItem(id, { paused: player.paused })
                }
              />
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function ListenProgress({ percent }: { percent: number }) {
  return (
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
  );
}

function ListenQueueHeader({
  currentIndex,
  total,
  filters,
  open,
  onToggle,
}: {
  currentIndex: number;
  total: number;
  filters?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("sentences");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 sm:px-10">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#3d4f66]">
        {t("listenQueue")}
        <span className="tabular-nums text-[var(--cahier-red,#d45d5d)]">
          {currentIndex >= 0 ? currentIndex + 1 : 0} / {total}
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
          aria-expanded={open}
          aria-label={t("listenQueue")}
          onClick={onToggle}
        >
          <X
            className={cn(
              "h-4 w-4 transition-transform",
              open ? "rotate-0" : "rotate-45",
            )}
          />
        </Button>
      </div>
    </div>
  );
}

function ListenQueueList({
  items,
  currentItemId,
  currentIndex,
  sessionActive,
  activeRowRef,
  onJump,
}: {
  items: ListenItem[];
  currentItemId?: string;
  currentIndex: number;
  sessionActive: boolean;
  activeRowRef: React.RefObject<HTMLButtonElement | null>;
  onJump: (id: string) => void;
}) {
  return (
    <ul className="max-h-80 space-y-1 overflow-y-auto border-t border-border/60 px-6 pr-7 pb-4 pt-2 sm:px-10 sm:pr-11">
      {items.map((item, index) => {
        const active = item.id === currentItemId;
        const past = currentIndex >= 0 && index < currentIndex;
        return (
          <li key={item.id}>
            <button
              type="button"
              ref={active ? activeRowRef : undefined}
              onClick={() => onJump(item.id)}
              disabled={!sessionActive}
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
  );
}

function ListenTransportControls({
  canPlay,
  canPrev,
  canNext,
  waiting,
  buffering = false,
  awaitingNext,
  paused,
  sessionActive,
  settingsOpen,
  onRepeat,
  onPrev,
  onToggle,
  onNext,
  onSettings,
}: {
  canPlay: boolean;
  canPrev: boolean;
  canNext: boolean;
  waiting: boolean;
  buffering?: boolean;
  awaitingNext: boolean;
  paused: boolean;
  sessionActive: boolean;
  settingsOpen: boolean;
  onRepeat: () => void;
  onPrev: () => void;
  onToggle: () => void;
  onNext: () => void;
  onSettings: () => void;
}) {
  const t = useTranslations("sentences");
  const sideBtn = "h-12 w-12 rounded-full [&_svg]:size-5";
  return (
    <div className="grid grid-cols-3 items-center border-t border-border/60 pt-5 [touch-action:manipulation]">
      <div className="flex items-center justify-end gap-0.5">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={sideBtn}
          disabled={!canPlay}
          onClick={onRepeat}
          aria-label={t("listenPlayerRepeat")}
        >
          <Repeat />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={sideBtn}
          disabled={!canPrev}
          onClick={onPrev}
          aria-label={t("listenPlayerPrev")}
        >
          <SkipBack />
        </Button>
      </div>
      <div className="flex justify-center">
        <Button
          type="button"
          size="icon"
          className={cn(
            "h-14 w-14 rounded-full shadow-lg [&_svg]:size-6",
            (waiting || buffering) && "animate-pulse",
          )}
          disabled={!canPlay}
          onClick={onToggle}
          aria-label={
            waiting
              ? t("listenPlayerNext")
              : paused || !sessionActive
                ? t("listenPlayerPlay")
                : t("listenPlayerPause")
          }
        >
          {paused || waiting || !sessionActive ? (
            <Play className="fill-current" />
          ) : (
            <Pause className="fill-current" />
          )}
        </Button>
      </div>
      <div className="flex items-center justify-start gap-0.5">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={sideBtn}
          disabled={!canNext && !awaitingNext}
          onClick={onNext}
          aria-label={t("listenPlayerNext")}
        >
          <SkipForward />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn(
            sideBtn,
            settingsOpen ? "bg-accent text-accent-foreground" : "",
          )}
          aria-expanded={settingsOpen}
          aria-label={t("listenSettings")}
          onClick={onSettings}
        >
          <Settings />
        </Button>
      </div>
    </div>
  );
}

function ListenSettings({
  settings,
  updateSettings,
  extra,
}: {
  settings: ReturnType<typeof useListenPlayer>["settings"];
  updateSettings: ReturnType<typeof useListenPlayer>["updateSettings"];
  extra?: React.ReactNode;
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
      {extra ? (
        <div className="space-y-2 border-t border-border/60 pt-4">{extra}</div>
      ) : null}
    </div>
  );
}

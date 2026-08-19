"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  settingsExtra?: React.ReactNode;
  compact?: boolean;
}) {
  const t = useTranslations("sentences");
  const player = useListenPlayer({ items, onFirstPassComplete });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(!compact);
  const activeRowRef = useRef<HTMLButtonElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const chromeTopRef = useRef<HTMLDivElement | null>(null);
  const chromeBottomRef = useRef<HTMLDivElement | null>(null);
  const [dockHeight, setDockHeight] = useState(0);

  useEffect(() => {
    if (!queueOpen) return;
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [player.currentItemId, queueOpen]);

  useLayoutEffect(() => {
    if (!compact) return;
    const top = chromeTopRef.current;
    const bottom = chromeBottomRef.current;
    if (!top || !bottom) return;
    const update = () => {
      const safe = dockRef.current
        ? parseFloat(getComputedStyle(dockRef.current).paddingBottom) || 0
        : 0;
      setDockHeight(
        top.getBoundingClientRect().height +
          bottom.getBoundingClientRect().height +
          safe,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(top);
    observer.observe(bottom);
    return () => observer.disconnect();
  }, [compact]);

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
    <div className={compact ? "flex min-h-0 flex-1 flex-col" : "space-y-8"}>
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

      <section
        className={cn(
          compact
            ? "flex min-h-0 flex-1 flex-col text-foreground"
            : "cahier-card overflow-hidden",
        )}
      >
        <div
          className={cn(
            compact ? "flex min-h-0 flex-1 flex-col p-4" : "space-y-6 p-6 sm:p-10",
          )}
        >
          <div
            className={cn(
              "flex flex-wrap items-center justify-between text-sm",
              compact ? "gap-2 text-muted-foreground" : "gap-3 text-[#3d4f66]",
            )}
          >
            <span className="flex items-center gap-2 font-semibold uppercase tracking-[0.16em]">
              <Headphones className="h-4 w-4" />
              {t("listenNowPlaying")}
              <span
                className={cn(
                  "tabular-nums",
                  compact
                    ? "text-primary"
                    : "text-[var(--cahier-red,#d45d5d)]",
                )}
              >
                {clipDone} / {clipTotal}
              </span>
            </span>
            <div className="text-right">
              <p
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-[0.18em]",
                  compact ? "text-muted-foreground" : "text-[#3d4f66]",
                )}
              >
                {t("listenPlayerLeft")}
              </p>
              <p
                className={cn(
                  "font-mono text-2xl font-semibold tabular-nums leading-none",
                  compact ? "text-foreground" : "text-[#1e3a5f]",
                )}
              >
                {formatListenClock(player.sessionRemainingMs)}
              </p>
            </div>
          </div>

          <div className={compact ? "mt-4 flex min-h-0 flex-1 flex-col" : undefined}>
            <div className={cn("relative", compact && "flex min-h-0 flex-1 flex-col")}>
              <div
                className={cn(
                  settingsOpen && "invisible",
                  compact && "flex flex-1 flex-col justify-center",
                )}
              >
                {displayItem?.badges && displayItem.badges.length > 0 ? (
                  <div className={cn("flex flex-wrap gap-2", compact && "mb-3")}>
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
                      "flex flex-col",
                      compact
                        ? "gap-4"
                        : "min-h-[13.5rem] gap-4 sm:min-h-[16rem]",
                      !compact &&
                        (displayItem.questionText
                          ? "justify-start"
                          : "justify-center"),
                    )}
                  >
                    {displayItem.questionText ? (
                      <div
                        className={cn(
                          "max-w-[85%] rounded-xl border px-4 py-3",
                          compact
                            ? "border-border bg-muted/50"
                            : "border-[#3d4f66]/35 bg-[#3d4f66]/10",
                        )}
                      >
                        <p
                          className={cn(
                            "text-[11px] font-bold uppercase tracking-[0.18em]",
                            compact ? "text-muted-foreground" : "text-[#3d4f66]",
                          )}
                        >
                          {t("listenIntro")}
                        </p>
                        {displayItem.questionTranslation ? (
                          <p
                            className={cn(
                              "mt-1.5 text-sm font-medium",
                              compact
                                ? "text-muted-foreground"
                                : "text-orange-500/80",
                            )}
                          >
                            {displayItem.questionTranslation}
                          </p>
                        ) : null}
                        <p
                          className={cn(
                            "mt-1 text-base font-medium leading-snug",
                            compact ? "text-foreground" : "text-[#1e3a5f]",
                          )}
                        >
                          {displayItem.questionText}
                        </p>
                      </div>
                    ) : null}
                    <div>
                      {currentNative ? (
                        <p
                          className={cn(
                            "mb-2 font-medium",
                            compact
                              ? "text-muted-foreground"
                              : "text-orange-500/80",
                            compact ? "text-base" : "text-lg sm:text-xl",
                          )}
                        >
                          {currentNative}
                        </p>
                      ) : null}
                      <p
                        className={cn(
                          "font-semibold leading-snug",
                          compact ? "text-foreground" : "text-[#1e3a5f]",
                          compact ? "text-2xl" : "text-3xl sm:text-5xl",
                          libreBaskerville.className,
                        )}
                      >
                        {currentTarget}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p
                    className={cn(
                      "text-lg",
                      compact ? "text-muted-foreground" : "text-[#3d4f66]",
                    )}
                  >
                    {t("listenReadyCount", { ready: 0, total: 0 })}
                  </p>
                )}
              </div>
              {settingsOpen ? (
                <div className="absolute inset-0 overflow-y-auto">
                  <ListenSettings
                    compact={compact}
                    settings={player.settings}
                    updateSettings={player.updateSettings}
                    extra={settingsExtra}
                  />
                </div>
              ) : null}
            </div>

            {compact ? null : (
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
                onToggle={
                  waiting ? player.goNextSentence : player.togglePause
                }
                onNext={player.goNextSentence}
                onSettings={toggleSettings}
              />
            )}
          </div>
        </div>

        {compact ? (
          <div
            aria-hidden
            className="shrink-0"
            style={{ height: dockHeight }}
          />
        ) : null}

        <div
          ref={dockRef}
          className={cn(
            compact &&
              "fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-lg flex-col overflow-hidden bg-background pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_28px_rgba(0,0,0,0.08)] transition-[height] duration-300 ease-out",
          )}
          style={
            compact
              ? {
                  height: queueOpen
                    ? "calc(100dvh - var(--pwa-nav-bottom, calc(env(safe-area-inset-top) + 3.75rem)))"
                    : dockHeight || undefined,
                }
              : undefined
          }
        >
          {compact ? (
            <>
              <div ref={chromeTopRef}>
                <ListenQueueHeader
                  compact
                  currentIndex={currentQueueIndex}
                  total={queueItems.length}
                  filters={filters}
                  open={queueOpen}
                  onToggle={() => setQueueOpen((open) => !open)}
                />
              </div>
              <div
                className="grid min-h-0 flex-1 transition-[grid-template-rows] duration-300 ease-out"
                style={{ gridTemplateRows: queueOpen ? "1fr" : "0fr" }}
              >
                <div className="min-h-0 overflow-hidden">
                  <ListenQueueList
                    compact
                    items={queueItems}
                    currentItemId={player.currentItemId ?? displayItem?.id}
                    currentIndex={currentQueueIndex}
                    sessionActive={player.sessionActive}
                    activeRowRef={activeRowRef}
                    onJump={(id) =>
                      player.jumpToItem(id, { paused: player.paused })
                    }
                  />
                </div>
              </div>
              <div ref={chromeBottomRef}>
                <ListenProgress compact percent={percent} />
                <ListenTransportControls
                  compact
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
                  onToggle={
                    waiting ? player.goNextSentence : player.togglePause
                  }
                  onNext={player.goNextSentence}
                  onSettings={toggleSettings}
                />
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function ListenProgress({
  compact = false,
  percent,
}: {
  compact?: boolean;
  percent: number;
}) {
  return (
    <div
      className={cn(
        "h-1",
        compact
          ? "bg-muted"
          : "bg-[var(--cahier-ink,#1e3a5f)]/8 dark:bg-white/10",
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <div
        className={cn(
          "h-full transition-[width] duration-700 ease-linear",
          compact ? "bg-primary" : "bg-[var(--cahier-red,#d45d5d)]/80",
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function ListenQueueHeader({
  compact = false,
  currentIndex,
  total,
  filters,
  open,
  onToggle,
}: {
  compact?: boolean;
  currentIndex: number;
  total: number;
  filters?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("sentences");
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        compact ? "px-4 py-2.5" : "px-6 py-3 sm:px-10",
        compact && "border-t border-border/60",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]",
          compact ? "text-muted-foreground" : "text-[#3d4f66]",
        )}
      >
        {t("listenQueue")}
        <span
          className={cn(
            "tabular-nums",
            compact ? "text-primary" : "text-[var(--cahier-red,#d45d5d)]",
          )}
        >
          {currentIndex >= 0 ? currentIndex + 1 : 0} / {total}
        </span>
      </span>
      <div className="flex items-center gap-2">
        {filters ? (
          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal
              className={cn(
                "h-3.5 w-3.5",
                compact ? "text-muted-foreground" : "text-[#3d4f66]",
              )}
            />
            {filters}
          </div>
        ) : null}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn(
            "h-8 w-8 rounded-full",
            compact ? "text-muted-foreground" : "text-[#3d4f66]",
          )}
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
  compact = false,
  items,
  currentItemId,
  currentIndex,
  sessionActive,
  activeRowRef,
  onJump,
}: {
  compact?: boolean;
  items: ListenItem[];
  currentItemId?: string;
  currentIndex: number;
  sessionActive: boolean;
  activeRowRef: React.RefObject<HTMLButtonElement | null>;
  onJump: (id: string) => void;
}) {
  return (
    <ul
      className={cn(
        "border-t border-border/60",
        compact
          ? "h-full space-y-0.5 overflow-y-auto px-3 pr-4 pb-2 pt-1.5"
          : "max-h-80 space-y-1 overflow-y-auto px-6 pr-7 pb-4 pt-2 sm:px-10 sm:pr-11",
      )}
    >
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
                "flex w-full items-start gap-3 rounded-lg border-2 text-left transition-colors",
                compact ? "px-2.5 py-1.5" : "px-3 py-2",
                active
                  ? compact
                    ? "border-primary bg-primary/10"
                    : "border-[#1e3a5f] bg-[#1e3a5f]/10"
                  : "border-transparent hover:bg-muted/60",
                past && !active ? "opacity-50" : "",
              )}
            >
              <span
                className={cn(
                  "w-6 shrink-0 pt-0.5 text-xs tabular-nums",
                  compact ? "text-muted-foreground" : "text-[#3d4f66]",
                )}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate font-medium",
                    compact ? "text-foreground" : "text-[#1e3a5f]",
                  )}
                >
                  {listenTargetText(item)}
                </span>
                {listenNativeText(item) ? (
                  <span
                    className={cn(
                      "mt-0.5 block truncate text-sm",
                      compact ? "text-muted-foreground" : "text-[#3d4f66]",
                    )}
                  >
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
  compact = false,
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
  compact?: boolean;
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
  const sideBtn = compact
    ? "h-14 w-14 rounded-full [&_svg]:size-6"
    : "h-12 w-12 rounded-full [&_svg]:size-5";
  return (
    <div
      className={cn(
        "grid grid-cols-3 items-center [touch-action:manipulation]",
        compact
          ? "border-t border-border/60 px-1 pb-2 pt-3"
          : "border-t border-border/60 pt-5",
      )}
    >
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
            "rounded-full shadow-lg",
            compact
              ? "h-20 w-20 [&_svg]:size-8"
              : "h-14 w-14 [&_svg]:size-6",
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
  compact = false,
  settings,
  updateSettings,
  extra,
}: {
  compact?: boolean;
  settings: ReturnType<typeof useListenPlayer>["settings"];
  updateSettings: ReturnType<typeof useListenPlayer>["updateSettings"];
  extra?: React.ReactNode;
}) {
  const t = useTranslations("sentences");
  const valueText = compact ? "text-muted-foreground" : "text-[#3d4f66]";
  const strongText = compact ? "text-foreground" : "text-[#1e3a5f]";
  return (
    <div className={cn("space-y-4", compact && "text-foreground")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="listen-pause">{t("listenPause")}</Label>
            <span className={cn("text-sm tabular-nums", valueText)}>
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
            <span className={cn("text-sm tabular-nums", valueText)}>
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
          <span className={cn("block font-medium", strongText)}>
            {t("listenMainLangOnce")}
          </span>
          <span className={cn("block", valueText)}>
            {t("listenMainLangOnceHint")}
          </span>
        </span>
      </label>
      {extra ? (
        <div className="space-y-2 border-t border-border/60 pt-4">
          {extra}
        </div>
      ) : null}
    </div>
  );
}

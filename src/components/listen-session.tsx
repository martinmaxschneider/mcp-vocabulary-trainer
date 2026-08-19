"use client";

import { useEffect, useRef } from "react";
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
import { Badge } from "~/components/ui/badge";
import { SatzListenPlayer } from "~/components/satz-listen-player";
import { formatListenRemaining } from "~/lib/audio-duration";
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
  actions,
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
}) {
  const t = useTranslations("sentences");
  const tModes = useTranslations("practiceModes");
  const player = useListenPlayer({ items, onFirstPassComplete });
  const activeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!player.sessionActive) return;
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [player.currentItemId, player.sessionActive]);

  const currentTarget = player.currentItem
    ? listenTargetText(player.currentItem)
    : "";
  const currentNative = player.currentItem
    ? listenNativeText(player.currentItem)
    : null;

  return (
    <div className={`space-y-8 ${player.sessionActive ? "pb-40" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-2 text-4xl font-bold">{title}</h1>
          {subtitle ? (
            <p className="text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {backHref ? (
            <Button asChild variant="ghost">
              <Link href={backHref}>{backLabel ?? t("importBack")}</Link>
            </Button>
          ) : null}
        </div>
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
                ready: player.readyItems.length,
                total: items.length,
              })}
              {player.readyItems.length > 0
                ? ` · ${t("listenEta", {
                    time: formatListenRemaining(player.sessionRemainingMs),
                  })}`
                : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onGenerateMissing ? (
              <Button
                type="button"
                variant="outline"
                disabled={generating}
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
              variant={player.settings.settingsOpen ? "secondary" : "ghost"}
              className="h-11 w-11"
              aria-expanded={player.settings.settingsOpen}
              aria-label={t("listenSettings")}
              onClick={() =>
                player.updateSettings({
                  settingsOpen: !player.settings.settingsOpen,
                })
              }
            >
              <Settings className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={player.readyItems.length === 0 || player.sessionActive}
              onClick={() =>
                player.startSession(player.readyItems.map((item) => item.id))
              }
            >
              <Play className="mr-2 h-5 w-5" />
              {t("listenStart")}
            </Button>
          </div>
        </div>

        {player.settings.settingsOpen ? (
          <ListenSettings
            settings={player.settings}
            updateSettings={player.updateSettings}
          />
        ) : null}
      </section>

      {player.sessionActive && player.currentItem ? (
        <>
          <section className="cahier-card space-y-4 p-6 sm:p-10">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-2 font-semibold uppercase tracking-[0.16em]">
                <Headphones className="h-4 w-4" />
                {t("listenNowPlaying")}
              </span>
              <span className="tabular-nums">
                {player.clipIndex + 1} / {player.playlist?.length ?? 0}
                {` · ${formatListenRemaining(player.sessionRemainingMs)}`}
              </span>
            </div>
            {player.currentItem.badges && player.currentItem.badges.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {player.currentItem.badges.map((badge) => (
                  <Badge key={badge} variant="outline">
                    {badge}
                  </Badge>
                ))}
              </div>
            ) : null}
            {player.currentItem.questionText ? (
              <p className="text-lg text-muted-foreground">
                {player.currentItem.questionText}
              </p>
            ) : null}
            <p className="text-3xl font-semibold leading-snug text-[#1e3a5f] sm:text-5xl">
              {currentTarget}
            </p>
            {currentNative ? (
              <p className="text-lg text-muted-foreground sm:text-xl">
                {currentNative}
              </p>
            ) : null}
          </section>

          <section className="cahier-card space-y-4 p-6">
            <h2 className="text-lg font-semibold">{t("listenTranscript")}</h2>
            <div className="max-h-[32rem] space-y-4 overflow-y-auto pr-1">
              {items.map((item) => {
                const active = item.id === player.currentItemId;
                return (
                  <div
                    key={item.id}
                    ref={active ? activeRef : undefined}
                    className="space-y-2"
                  >
                    {item.questionText ? (
                      <button
                        type="button"
                        onClick={() => player.jumpToItem(item.id)}
                        className={cn(
                          "max-w-[85%] rounded-2xl rounded-bl-md border px-4 py-3 text-left transition-colors",
                          active
                            ? "border-[#1e3a5f] bg-[#1e3a5f]/8"
                            : "border-border bg-muted/40 hover:bg-muted",
                        )}
                      >
                        <p className="text-base font-semibold leading-snug">
                          {item.questionText}
                        </p>
                        {item.questionTranslation ? (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {item.questionTranslation}
                          </p>
                        ) : null}
                      </button>
                    ) : null}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => player.jumpToItem(item.id)}
                        className={cn(
                          "max-w-[85%] rounded-2xl rounded-br-md border px-4 py-3 text-left transition-colors",
                          active
                            ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                            : "border-border bg-[var(--cahier-paper,#fff)] hover:bg-muted/50",
                        )}
                      >
                        <p className="text-base font-semibold leading-snug">
                          {listenTargetText(item)}
                        </p>
                        {listenNativeText(item) ? (
                          <p
                            className={cn(
                              "mt-1 text-sm",
                              active ? "text-white/80" : "text-muted-foreground",
                            )}
                          >
                            {listenNativeText(item)}
                          </p>
                        ) : null}
                        {item.badges && item.badges.length > 0 ? (
                          <p
                            className={cn(
                              "mt-2 text-xs uppercase tracking-wide",
                              active ? "text-white/70" : "text-muted-foreground",
                            )}
                          >
                            {item.badges.join(" · ")}
                          </p>
                        ) : null}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : null}

      {player.sessionActive && player.currentClip ? (
        <SatzListenPlayer
          mainText={currentTarget}
          translationText={currentNative}
          done={player.clipIndex + 1}
          total={player.playlist?.length ?? 0}
          remainingMs={player.sessionRemainingMs}
          totalMs={player.sessionTotalMs}
          paused={player.paused}
          awaitingNext={player.awaitingNext}
          canPrev={Boolean(
            player.bounds &&
              (player.bounds.prevStart != null ||
                player.clipIndex > player.bounds.start),
          )}
          canNext={
            Boolean(
              player.playlist &&
                player.clipIndex < player.playlist.length - 1,
            ) || player.awaitingNext
          }
          onPrev={player.goPrevSentence}
          onNext={player.goNextSentence}
          onTogglePause={player.togglePause}
          onRepeat={player.repeatSentence}
          onClose={player.stopPlayback}
        />
      ) : null}
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
  );
}

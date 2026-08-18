"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AudioStatus } from "@prisma/client";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import { Progress } from "~/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";
import { LISTEN_PAUSE_MS, playbackUrls } from "~/lib/satz-tts";
import { useFocusLang } from "~/components/focus-lang-provider";
import { Headphones, Loader2, Pause, Play, Square, Volume2 } from "lucide-react";

function errorDescription(
  message: string,
  tErrors: (key: "NOT_FOUND") => string,
) {
  const code = resolveErrorCode(message);
  return code ? tErrors(code as "NOT_FOUND") : message;
}

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

  const { data, isLoading } = api.satz.list.useQuery({
    ids,
    limit: 200,
  });
  const items = data?.items ?? [];

  const [selected, setSelected] = useState<Set<string>>(() => new Set(ids ?? []));
  const didInitSelection = useRef(false);
  const [includeQuestions, setIncludeQuestions] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState({ done: 0, total: 0 });
  const [playProgress, setPlayProgress] = useState({ done: 0, total: 0 });
  const [playingId, setPlayingId] = useState<string | null>(null);
  const stopRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (didInitSelection.current || items.length === 0) return;
    didInitSelection.current = true;
    if (!ids) {
      setSelected(new Set(items.map((satz) => satz.id)));
    }
  }, [ids, items]);

  const requestMutation = api.satz.requestAudio.useMutation();
  const processMutation = api.satz.processAudio.useMutation();

  const readyCount = useMemo(() => {
    return items.filter((satz) => {
      const translation = satz.translations.find((tr) => tr.lang === focusLang);
      return translation?.audioStatus === AudioStatus.DONE && translation.audioUrl;
    }).length;
  }, [items, focusLang]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const stopPlayback = () => {
    stopRef.current = true;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
  };

  const playUrl = (url: string) =>
    new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("AUDIO_PLAY_FAILED"));
      void audio.play().catch(reject);
    });

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  const playQueue = async (satzIds: string[]) => {
    stopRef.current = false;
    const jobs = satzIds.flatMap((satzId) => {
      const satz = items.find((item) => item.id === satzId);
      if (!satz) return [];
      const answer = satz.translations.find((tr) => tr.lang === focusLang);
      const question = satz.answerTo?.translations.find(
        (tr) => tr.lang === focusLang,
      );
      const questionClips = satz.answerTo
        ? playbackUrls({
            mainUrl: satz.answerTo.mainAudioUrl,
            mainStatus: satz.answerTo.mainAudioStatus,
            mainUpdatedAt: satz.answerTo.updatedAt,
            translationUrl: question?.audioUrl,
            translationStatus: question?.audioStatus,
            translationUpdatedAt: question?.updatedAt,
          })
        : [];
      const answerClips = playbackUrls({
        mainUrl: satz.mainAudioUrl,
        mainStatus: satz.mainAudioStatus,
        mainUpdatedAt: satz.updatedAt,
        translationUrl: answer?.audioUrl,
        translationStatus: answer?.audioStatus,
        translationUpdatedAt: answer?.updatedAt,
      });
      const clips = [...questionClips, ...answerClips];
      return clips.length > 0 ? [{ satzId, clips }] : [];
    });
    const total = jobs.reduce((sum, job) => sum + job.clips.length, 0);
    setPlayProgress({ done: 0, total });
    let done = 0;
    try {
      for (const job of jobs) {
        if (stopRef.current) break;
        setPlayingId(job.satzId);
        for (let i = 0; i < job.clips.length; i++) {
          if (stopRef.current) break;
          done += 1;
          setPlayProgress({ done, total });
          await playUrl(job.clips[i]!);
          if (stopRef.current) break;
          if (i < job.clips.length - 1) {
            await sleep(LISTEN_PAUSE_MS);
          }
        }
        if (!stopRef.current) {
          await sleep(400);
        }
      }
    } catch (error) {
      toast({
        title: tToasts("satzAudioPlayError"),
        description:
          error instanceof Error ? errorDescription(error.message, tErrors) : undefined,
        variant: "destructive",
      });
    } finally {
      setPlayingId(null);
      audioRef.current = null;
      setPlayProgress({ done: 0, total: 0 });
    }
  };

  const handleGenerate = async () => {
    const satzIds = selected.size > 0 ? [...selected] : items.map((s) => s.id);
    if (satzIds.length === 0) return;
    setGenerating(true);
    setGenerateProgress({ done: 0, total: 0 });
    try {
      const requested = await requestMutation.mutateAsync({
        satzIds,
        includeQuestions,
        langs: [focusLang],
      });
      const total = requested.requested;
      setGenerateProgress({ done: 0, total });
      let remaining = total;
      let done = 0;
      while (remaining > 0) {
        const result = await processMutation.mutateAsync({ limit: 2 });
        done += result.processed + result.failed;
        remaining = result.remaining;
        setGenerateProgress({
          done: Math.min(done, total || done),
          total: total || done + remaining,
        });
        await utils.satz.list.invalidate();
        if (result.processed === 0 && result.failed === 0) break;
      }
      if (total > 0) setGenerateProgress({ done: total, total });
      toast({ title: tToasts("satzAudioDone") });
    } catch (error) {
      toast({
        title: tToasts("satzAudioError"),
        description:
          error instanceof Error ? errorDescription(error.message, tErrors) : undefined,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
      setGenerateProgress({ done: 0, total: 0 });
    }
  };

  const actionProgress = generating ? generateProgress : playProgress;
  const actionPercent =
    actionProgress.total > 0
      ? Math.round((actionProgress.done / actionProgress.total) * 100)
      : 0;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-2 text-4xl font-bold">{t("listenTitle")}</h1>
          <p className="text-muted-foreground">{t("listenSubtitle")}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/sentences">{t("importBack")}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Headphones className="h-5 w-5" />
            {t("listenActions")}
          </CardTitle>
          <CardDescription>
            {t("listenReadyCount", { ready: readyCount, total: items.length })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={includeQuestions}
                onCheckedChange={(checked) => setIncludeQuestions(checked === true)}
              />
              {t("listenIncludeQuestions")}
            </label>
            <Button
              type="button"
              disabled={generating || items.length === 0}
              onClick={() => void handleGenerate()}
            >
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Volume2 className="mr-2 h-4 w-4" />
              )}
              {t("listenGenerate")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={readyCount === 0 || generating}
              onClick={() => {
                const linkedQuestionIds = new Set(
                  items
                    .map((satz) => satz.answerTo?.id)
                    .filter((id): id is string => Boolean(id)),
                );
                void playQueue(
                  items
                    .filter((satz) => {
                      if (linkedQuestionIds.has(satz.id)) return false;
                      const translation = satz.translations.find(
                        (tr) => tr.lang === focusLang,
                      );
                      return (
                        translation?.audioStatus === AudioStatus.DONE &&
                        Boolean(translation.audioUrl)
                      );
                    })
                    .map((satz) => satz.id),
                );
              }}
            >
              <Play className="mr-2 h-4 w-4" />
              {t("listenStart")}
            </Button>
            {playingId ? (
              <Button type="button" variant="ghost" onClick={stopPlayback}>
                <Square className="mr-2 h-4 w-4" />
                {tCommon("cancel")}
              </Button>
            ) : null}
          </div>
          {generating || playingId ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                  {generating ? t("listenGenerating") : t("listenPlaying")}
                </span>
                {actionProgress.total > 0 ? (
                  <span>
                    {actionProgress.done} / {actionProgress.total}
                  </span>
                ) : null}
              </div>
              <Progress value={actionPercent} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyDesc")}</p>
        ) : (
          items.map((satz) => {
            const translation = satz.translations.find(
              (tr) => tr.lang === focusLang,
            );
            const status = translation?.audioStatus ?? AudioStatus.NONE;
            return (
              <div key={satz.id} className="cahier-item space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <label className="flex items-start gap-3">
                    <Checkbox
                      checked={selected.has(satz.id)}
                      onCheckedChange={() => toggle(satz.id)}
                    />
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
                  </label>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{t(`audioStatus${status}`)}</Badge>
                    {playbackUrls({
                      mainUrl: satz.mainAudioUrl,
                      mainStatus: satz.mainAudioStatus,
                      mainUpdatedAt: satz.updatedAt,
                      translationUrl: translation?.audioUrl,
                      translationStatus: status,
                      translationUpdatedAt: translation?.updatedAt,
                    }).length > 0 ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => void playQueue([satz.id])}
                        disabled={generating}
                      >
                        {playingId === satz.id ? (
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
    </div>
  );
}

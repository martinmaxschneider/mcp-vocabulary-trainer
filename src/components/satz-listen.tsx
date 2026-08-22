"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AudioStatus, MediaKind, SatzPriority } from "@prisma/client";
import { api } from "~/trpc/client";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { ListenSession } from "~/components/listen-session";
import { useFocusLang } from "~/components/focus-lang-provider";
import { useToast } from "~/hooks/use-toast";
import { groupDomainsByKind } from "~/lib/domain-catalog";
import { MEDIA_KINDS } from "~/lib/media-work";
import { mediaWorkLabel } from "~/components/media-work-picker";
import { MAX_BOX, MIN_BOX } from "~/lib/leitner";
import { drainAudioQueue } from "~/lib/process-audio-queue";
import { playbackClips } from "~/lib/satz-tts";
import { resolveErrorCode } from "~/lib/trpc-error";

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
  const tModes = useTranslations("practiceModes");
  const tNav = useTranslations("nav");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const { focusLang } = useFocusLang();
  const utils = api.useUtils();

  const [domainId, setDomainId] = useState("all");
  const [priority, setPriority] = useState("all");
  const [box, setBox] = useState("all");
  const [mediaKind, setMediaKind] = useState("all");
  const [mediaWorkId, setMediaWorkId] = useState("all");
  const [generating, setGenerating] = useState(false);

  const { data: domains } = api.domain.list.useQuery();
  const { data: mediaWorks } = api.mediaWork.list.useQuery({
    kind: mediaKind !== "all" ? (mediaKind as MediaKind) : undefined,
    limit: 100,
  });
  const { data, isLoading } = api.satz.list.useQuery({
    ...(ids ? { ids } : {}),
    ...(!ids && domainId !== "all" ? { domainId } : {}),
    ...(!ids && priority !== "all" ? { priority: priority as SatzPriority } : {}),
    ...(!ids && mediaKind !== "all" ? { mediaKind: mediaKind as MediaKind } : {}),
    ...(!ids && mediaWorkId !== "all" ? { mediaWorkId } : {}),
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

  const markPracticed = api.satz.markPracticed.useMutation({
    onSuccess: () => {
      void utils.satz.list.invalidate();
    },
  });
  const requestAudio = api.satz.requestAudio.useMutation();
  const processAudio = api.satz.processAudio.useMutation();

  const listenItems = useMemo(() => {
    const linkedQuestionIds = new Set(
      items
        .map((satz) => satz.answerTo?.id)
        .filter((id): id is string => Boolean(id)),
    );
    return items
      .filter((satz) => !linkedQuestionIds.has(satz.id))
      .map((satz) => {
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
        return {
          id: satz.id,
          mainText: answer?.text ?? satz.mainText,
          translationText: satz.mainText,
          targetText: answer?.text ?? satz.mainText,
          nativeText: satz.mainText,
          questionText: question?.text ?? satz.answerTo?.mainText ?? null,
          questionTranslation: satz.answerTo?.mainText ?? null,
          extraText: satz.answerTo
            ? `${t("answerToPrefix")}: ${satz.answerTo.mainText}`
            : null,
          clips: [...questionClips, ...answerClips],
          audioStatus: answer?.audioStatus ?? AudioStatus.NONE,
        };
      });
  }, [items, focusLang, t]);

  const generateMissing = async () => {
    const satzIds = listenItems
      .filter((item) => item.clips.length === 0)
      .map((item) => item.id);
    if (satzIds.length === 0) return;
    setGenerating(true);
    try {
      await requestAudio.mutateAsync({
        satzIds,
        includeQuestions: true,
        langs: [focusLang],
      });
      await drainAudioQueue((limit) => processAudio.mutateAsync({ limit }));
      await utils.satz.list.invalidate();
      toast({ title: tToasts("satzAudioDone") });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const code = resolveErrorCode(message);
      toast({
        title: tToasts("satzAudioError"),
        description: code ? tErrors(code as "NOT_FOUND") : message || undefined,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>;
  }

  return (
    <ListenSession
      title={tModes("listenPageTitle", { area: tNav("sentences") })}
      subtitle={tModes("listenHint")}
      items={listenItems}
      backHref="/sentences/review"
      backLabel={tCommon("back")}
      generating={generating}
      onGenerateMissing={generateMissing}
      onFirstPassComplete={(satzIds) => markPracticed.mutate({ satzIds })}
      filters={
        ids ? undefined : (
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
            <div className="space-y-2">
              <Label>{t("reviewFilterMediaKind")}</Label>
              <Select
                value={mediaKind}
                onValueChange={(value) => {
                  setMediaKind(value);
                  setMediaWorkId("all");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filterAllMediaKinds")}</SelectItem>
                  {MEDIA_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {t(`mediaKind${kind}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("reviewFilterMediaWork")}</Label>
              <Select value={mediaWorkId} onValueChange={setMediaWorkId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filterAllMediaWorks")}</SelectItem>
                  {(mediaWorks?.items ?? []).map((work) => (
                    <SelectItem key={work.id} value={work.id}>
                      {mediaWorkLabel(work, (kind) => t(`mediaKind${kind}`))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )
      }
    />
  );
}

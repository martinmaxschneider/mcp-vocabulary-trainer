"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "~/trpc/client";
import { ListenSession } from "~/components/listen-session";
import { useFocusLang } from "~/components/focus-lang-provider";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useToast } from "~/hooks/use-toast";
import { drainAudioQueue } from "~/lib/process-audio-queue";
import { playbackClips } from "~/lib/satz-tts";
import { resolveErrorCode } from "~/lib/trpc-error";

export default function VocabListenPage() {
  const t = useTranslations("review");
  const tModes = useTranslations("practiceModes");
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const { focusLang } = useFocusLang();
  const [domainId, setDomainId] = useState("all");
  const [generating, setGenerating] = useState(false);
  const utils = api.useUtils();
  const { data: domains } = api.domain.list.useQuery();
  const { data } = api.entry.list.useQuery({
    domainId: domainId === "all" ? undefined : domainId,
  });
  const requestAudio = api.entry.requestAudio.useMutation();
  const processAudio = api.entry.processAudio.useMutation();

  const items = useMemo(
    () =>
      (data?.entries ?? []).map((entry) => {
        const translation = entry.translations.find((tr) => tr.lang === focusLang);
        return {
          id: entry.id,
          mainText: entry.mainText,
          translationText: translation?.text ?? null,
          clips: playbackClips({
            mainUrl: entry.mainAudioUrl,
            mainStatus: entry.mainAudioStatus,
            mainUpdatedAt: entry.updatedAt,
            mainDurationMs: entry.mainAudioDurationMs,
            translationUrl: translation?.audioUrl,
            translationStatus: translation?.audioStatus,
            translationUpdatedAt: translation?.updatedAt,
            translationDurationMs: translation?.audioDurationMs,
          }),
          audioStatus: translation?.audioStatus ?? entry.mainAudioStatus,
        };
      }),
    [data?.entries, focusLang],
  );

  const generateMissing = async () => {
    const ids = (data?.entries ?? [])
      .filter((entry) => {
        const translation = entry.translations.find((tr) => tr.lang === focusLang);
        return (
          entry.mainAudioStatus !== "DONE" || translation?.audioStatus !== "DONE"
        );
      })
      .map((entry) => entry.id);
    if (ids.length === 0) return;
    setGenerating(true);
    try {
      await requestAudio.mutateAsync({ entryIds: ids, langs: [focusLang] });
      await drainAudioQueue((limit) => processAudio.mutateAsync({ limit }));
      await utils.entry.list.invalidate();
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

  return (
    <ListenSession
      title={tModes("listenPageTitle", { area: tNav("review") })}
      subtitle={tModes("listenHint")}
      items={items}
      backHref="/review"
      backLabel={tCommon("back")}
      generating={generating}
      onGenerateMissing={generateMissing}
      filters={
        <div className="space-y-2">
          <Label>{t("selectDomains")}</Label>
          <Select value={domainId} onValueChange={setDomainId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("leaveEmpty")}</SelectItem>
              {(domains ?? []).map((domain) => (
                <SelectItem key={domain.id} value={domain.id}>
                  {domain.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    />
  );
}

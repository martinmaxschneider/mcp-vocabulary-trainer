"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "~/trpc/client";
import { ListenSession } from "~/components/listen-session";
import { useFocusLang } from "~/components/focus-lang-provider";
import { useToast } from "~/hooks/use-toast";
import { drainAudioQueue } from "~/lib/process-audio-queue";
import { audioUrlWithVersion } from "~/lib/satz-tts";
import { resolveErrorCode } from "~/lib/trpc-error";

export default function ConjugationListenPage() {
  const tModes = useTranslations("practiceModes");
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const { focusLang } = useFocusLang();
  const [generating, setGenerating] = useState(false);
  const utils = api.useUtils();
  const { data } = api.conjugation.listListenClips.useQuery({
    targetLang: focusLang,
  });
  const requestMissing = api.conjugation.requestMissingParadigmAudio.useMutation();
  const processAudio = api.conjugation.processAudio.useMutation();

  const items = useMemo(
    () =>
      (data?.items ?? []).map((item) => ({
        id: item.id,
        mainText: item.mainText,
        translationText: `${item.translationText} · ${item.tenseKey}`,
        clips: item.audioUrl
          ? [
              {
                url: audioUrlWithVersion(item.audioUrl, item.updatedAt),
                durationMs: item.audioDurationMs ?? null,
                kind: "translation" as const,
              },
            ]
          : [],
        audioStatus: item.audioUrl ? "DONE" : "NONE",
      })),
    [data?.items],
  );

  const generateMissing = async () => {
    setGenerating(true);
    try {
      await requestMissing.mutateAsync({ targetLang: focusLang });
      await drainAudioQueue((limit) => processAudio.mutateAsync({ limit }));
      await utils.conjugation.listListenClips.invalidate();
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
      title={tModes("listenPageTitle", { area: tNav("conjugations") })}
      subtitle={tModes("listenHint")}
      items={items}
      backHref="/practice/conjugations"
      backLabel={tCommon("back")}
      generating={generating}
      onGenerateMissing={generateMissing}
    />
  );
}

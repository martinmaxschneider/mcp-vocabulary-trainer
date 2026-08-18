"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Volume2 } from "lucide-react";
import { api } from "~/trpc/client";
import { ListenSession } from "~/components/listen-session";
import { useFocusLang } from "~/components/focus-lang-provider";
import { Button } from "~/components/ui/button";
import { useToast } from "~/hooks/use-toast";
import { drainAudioQueue } from "~/lib/process-audio-queue";
import { audioUrlWithVersion } from "~/lib/satz-tts";
import { resolveErrorCode } from "~/lib/trpc-error";

export default function ConjugationListenPage() {
  const t = useTranslations("conjugations");
  const tModes = useTranslations("practiceModes");
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
      (data?.items ?? [])
        .filter((item) => item.audioUrl)
        .map((item) => ({
          id: item.id,
          mainText: item.mainText,
          translationText: `${item.translationText} · ${item.tenseKey}`,
          clips: [
            {
              url: audioUrlWithVersion(item.audioUrl!, item.updatedAt),
              durationMs: item.audioDurationMs ?? null,
              kind: "translation" as const,
            },
          ],
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
      title={tModes("listen")}
      subtitle={t("practiceSubtitle")}
      items={items}
      filters={
        <Button
          type="button"
          variant="outline"
          disabled={generating}
          onClick={() => void generateMissing()}
        >
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Volume2 className="mr-2 h-4 w-4" />
          )}
          {tModes("generateMissingAudio")}
        </Button>
      }
    />
  );
}

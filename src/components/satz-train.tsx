"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ShadowingStatus } from "@prisma/client";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useToast } from "~/hooks/use-toast";
import { useFocusLang } from "~/components/focus-lang-provider";
import { playbackUrls } from "~/lib/satz-tts";
import {
  SATZ_LISTEN_RATE_OPTIONS,
  SATZ_LISTEN_REPEAT_OPTIONS,
} from "~/lib/satz-listen-settings";
import { SOURCE_LANG } from "~/lib/languages";
import { Loader2, Repeat, Square, Volume2 } from "lucide-react";

export function SatzTrain({ id }: { id: string }) {
  const t = useTranslations("sentences");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("languages");
  const tToasts = useTranslations("toasts");
  const { toast } = useToast();
  const { focusLang } = useFocusLang();
  const utils = api.useUtils();

  const { data: satz, isLoading } = api.satz.getById.useQuery({ id });
  const markPracticed = api.satz.markPracticed.useMutation({
    onSuccess: () => {
      void utils.satz.getById.invalidate({ id });
    },
  });
  const setShadowing = api.satz.setShadowingStatus.useMutation({
    onSuccess: () => {
      toast({ title: tToasts("satzMarkedMastered") });
      void utils.satz.getById.invalidate({ id });
    },
  });

  const [rate, setRate] = useState(1);
  const [repeats, setRepeats] = useState(3);
  const [playing, setPlaying] = useState(false);
  const stopRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const translation = satz?.translations.find((tr) => tr.lang === focusLang);
  const mainClips = playbackUrls({
    mainUrl: satz?.mainAudioUrl,
    mainStatus: satz?.mainAudioStatus,
    mainUpdatedAt: satz?.updatedAt,
  });
  const translationClips = playbackUrls({
    translationUrl: translation?.audioUrl,
    translationStatus: translation?.audioStatus,
    translationUpdatedAt: translation?.updatedAt,
  });

  const stop = () => {
    stopRef.current = true;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
  };

  const playUrl = (url: string) =>
    new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      audio.playbackRate = rate;
      audioRef.current = audio;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("AUDIO_PLAY_FAILED"));
      void audio.play().catch(reject);
    });

  const loopTranslation = async () => {
    if (translationClips.length === 0) return;
    stopRef.current = false;
    setPlaying(true);
    try {
      for (let i = 0; i < repeats; i++) {
        if (stopRef.current) break;
        for (const url of translationClips) {
          if (stopRef.current) break;
          await playUrl(url);
        }
      }
      if (!stopRef.current && satz?.shadowingStatus === ShadowingStatus.NOT_STARTED) {
        markPracticed.mutate({ satzIds: [id] });
      }
    } finally {
      audioRef.current = null;
      setPlaying(false);
    }
  };

  if (isLoading || !satz) {
    return <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-2 text-4xl font-bold">{t("trainTitle")}</h1>
          <p className="text-muted-foreground">{t("trainSubtitle")}</p>
        </div>
        <Button asChild variant="ghost">
          <Link href="/sentences">{t("importBack")}</Link>
        </Button>
      </div>

      <section className="cahier-card space-y-5 p-6">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{t(`shadowing${satz.shadowingStatus}`)}</Badge>
          <Badge variant="secondary">{t(`priority${satz.priority}`)}</Badge>
        </div>
        {satz.trigger ? (
          <p className="text-sm text-muted-foreground">
            {t("triggerPrefix")}: {satz.trigger}
          </p>
        ) : null}
        <p className="text-2xl font-semibold">{satz.mainText}</p>
        {translation ? (
          <p className="text-xl text-muted-foreground">{translation.text}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("trainNoTranslation", { language: tLang(focusLang) })}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("listenSpeed")}</Label>
            <Select
              value={String(rate)}
              onValueChange={(value) => setRate(Number(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SATZ_LISTEN_RATE_OPTIONS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}×
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("listenRepeatsSentence")}</Label>
            <Select
              value={String(repeats)}
              onValueChange={(value) => setRepeats(Number(value))}
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
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="lg"
            disabled={translationClips.length === 0 || playing}
            onClick={() => void loopTranslation()}
          >
            {playing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Repeat className="mr-2 h-4 w-4" />
            )}
            {t("trainStart")}
          </Button>
          {playing ? (
            <Button type="button" variant="outline" size="lg" onClick={stop}>
              <Square className="mr-2 h-4 w-4" />
              {tCommon("cancel")}
            </Button>
          ) : null}
          {mainClips.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const audio = new Audio(mainClips[0]);
                audio.playbackRate = rate;
                void audio.play();
              }}
            >
              <Volume2 className="mr-2 h-4 w-4" />
              {t("playAudioLang", { language: tLang(SOURCE_LANG.code) })}
            </Button>
          ) : null}
          {satz.shadowingStatus !== ShadowingStatus.MASTERED ? (
            <Button
              type="button"
              variant="outline"
              disabled={setShadowing.isPending}
              onClick={() =>
                setShadowing.mutate({
                  id,
                  shadowingStatus: ShadowingStatus.MASTERED,
                })
              }
            >
              {t("trainMarkMastered")}
            </Button>
          ) : (
            <p className="self-center text-sm text-muted-foreground">
              {t("trainMastered")}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SatzPriority } from "@prisma/client";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Label } from "~/components/ui/label";
import { SatzAudioButton } from "~/components/satz-audio-button";
import { SessionSummary } from "~/components/session-summary";
import {
  remainingBoxCounts,
  ReviewBoxBar,
} from "~/components/review-box-bar";
import { useFocusLang } from "~/components/focus-lang-provider";
import { useCelebrate } from "~/components/gamification-provider";
import { groupDomainsByKind } from "~/lib/domain-catalog";
import { SOURCE_LANG } from "~/lib/languages";
import { playbackUrls } from "~/lib/satz-tts";
import { MAX_BOX, MIN_BOX } from "~/lib/leitner";
import { Eye, ThumbsDown, ThumbsUp } from "lucide-react";

type ReviewState = "setup" | "active" | "summary";

const PRIORITIES: SatzPriority[] = [
  "DAILY",
  "WEEKLY",
  "OCCASIONAL",
  "RARE",
];

export function SatzReview() {
  const t = useTranslations("sentences");
  const tDomains = useTranslations("domains");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("languages");
  const { focusLang } = useFocusLang();
  const celebrate = useCelebrate();

  const [state, setState] = useState<ReviewState>("setup");
  const [domainId, setDomainId] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [box, setBox] = useState<string>("all");
  const [revealed, setRevealed] = useState(false);
  const [index, setIndex] = useState(0);
  const [completedBoxes, setCompletedBoxes] = useState<number[]>([]);
  const [session, setSession] = useState({
    answers: 0,
    correct: 0,
    xp: 0,
    streak: 0,
  });

  const filters = {
    targetLang: focusLang,
    domainId: domainId === "all" ? undefined : domainId,
    priority:
      priority === "all" ? undefined : (priority as SatzPriority),
    box: box === "all" ? undefined : Number(box),
  };

  const { data: domains } = api.domain.list.useQuery();
  const statsQuery = api.satzReview.stats.useQuery(filters, {
    enabled: state === "setup",
  });
  const queueQuery = api.satzReview.queue.useQuery(
    { ...filters, limit: 30 },
    { enabled: state === "active" },
  );

  const gradeMutation = api.satzReview.grade.useMutation({
    onSuccess: (data) => {
      celebrate(data.gamification);
      setSession((prev) => ({
        answers: prev.answers + 1,
        correct: prev.correct + (data.isCorrect ? 1 : 0),
        xp: prev.xp + (data.gamification?.xpEarned ?? 0),
        streak: data.gamification?.streak ?? prev.streak,
      }));
      setCompletedBoxes((prev) => [...prev, data.boxBefore]);
      setRevealed(false);
      setIndex((prev) => prev + 1);
    },
  });

  const themeDomains = useMemo(
    () =>
      groupDomainsByKind(
        (domains ?? []).filter(
          (d) => d.kind === "THEME" || d.kind === "SPECIAL",
        ),
      ).flatMap((group) => group.domains),
    [domains],
  );

  const cards = queueQuery.data?.cards ?? [];
  const card = cards[index];
  const remaining = remainingBoxCounts(
    queueQuery.data?.boxCounts,
    completedBoxes,
  );

  useEffect(() => {
    if (state !== "active" || queueQuery.isLoading || card) return;
    setState("summary");
  }, [state, queueQuery.isLoading, card]);

  const start = () => {
    setIndex(0);
    setRevealed(false);
    setCompletedBoxes([]);
    setSession({ answers: 0, correct: 0, xp: 0, streak: 0 });
    setState("active");
  };

  if (state === "summary") {
    return (
      <div className="max-w-3xl space-y-6">
        <SessionSummary
          answers={session.answers}
          correct={session.correct}
          xp={session.xp}
          streak={session.streak}
          perfect={
            session.answers > 0 && session.correct === session.answers
          }
          onDone={() => setState("setup")}
        />
      </div>
    );
  }

  if (state === "setup") {
    const due = statsQuery.data?.due ?? 0;
    return (
      <div className="max-w-3xl space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="mb-2 text-4xl font-bold">{t("reviewTitle")}</h1>
            <p className="text-muted-foreground">{t("reviewSubtitle")}</p>
          </div>
          <Button asChild variant="ghost">
            <Link href="/sentences">{t("importBack")}</Link>
          </Button>
        </div>

        <section className="cahier-card space-y-5 p-6">
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
          </div>

          <p className="text-sm text-muted-foreground">
            {t("reviewDueCount", { count: due, language: tLang(focusLang) })}
          </p>
          <Button type="button" size="lg" disabled={due === 0} onClick={start}>
            {t("reviewStart")}
          </Button>
        </section>
        {themeDomains.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tDomains("kindTHEME")}</p>
        ) : null}
      </div>
    );
  }

  if (queueQuery.isLoading || !card) {
    return <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>;
  }

  const translation = card.translation;
  const mainClips = playbackUrls({
    mainUrl: card.mainAudioUrl,
    mainStatus: card.mainAudioStatus,
    mainUpdatedAt: card.updatedAt,
  });
  const translationClips = playbackUrls({
    translationUrl: translation?.audioUrl,
    translationStatus: translation?.audioStatus,
    translationUpdatedAt: translation?.updatedAt,
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("reviewProgress", {
            current: session.answers + 1,
            total: queueQuery.data?.totalAvailable ?? cards.length,
          })}
        </p>
        <Button variant="ghost" onClick={() => setState("summary")}>
          {tCommon("cancel")}
        </Button>
      </div>
      <ReviewBoxBar remaining={remaining} />

      <section className="cahier-card space-y-5 p-6">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{tCommon("box", { number: card.box })}</Badge>
          <Badge variant="secondary">{t(`priority${card.priority}`)}</Badge>
          {card.domains.map((domain) => (
            <Badge key={domain.id} variant="outline">
              {domain.name}
            </Badge>
          ))}
        </div>
        {card.trigger ? (
          <p className="text-sm text-muted-foreground">
            {t("triggerPrefix")}: {card.trigger}
          </p>
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <p className="text-2xl font-semibold">{card.mainText}</p>
          <SatzAudioButton
            urls={mainClips}
            langCode={SOURCE_LANG.code}
            label={t("playAudioLang", { language: tLang(SOURCE_LANG.code) })}
          />
        </div>

        {revealed && translation ? (
          <div className="flex items-start justify-between gap-3 border-t border-border/60 pt-4">
            <p className="text-xl">{translation.text}</p>
            <SatzAudioButton
              urls={translationClips}
              langCode={focusLang}
              label={t("playAudioLang", { language: tLang(focusLang) })}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!revealed ? (
            <Button type="button" size="lg" onClick={() => setRevealed(true)}>
              <Eye className="mr-2 h-4 w-4" />
              {t("reviewShowAnswer")}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="lg"
                disabled={gradeMutation.isPending}
                onClick={() =>
                  gradeMutation.mutate({
                    satzId: card.satzId,
                    targetLang: focusLang,
                    isCorrect: true,
                  })
                }
              >
                <ThumbsUp className="mr-2 h-4 w-4" />
                {t("reviewKnew")}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={gradeMutation.isPending}
                onClick={() =>
                  gradeMutation.mutate({
                    satzId: card.satzId,
                    targetLang: focusLang,
                    isCorrect: false,
                  })
                }
              >
                <ThumbsDown className="mr-2 h-4 w-4" />
                {t("reviewDidNotKnow")}
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

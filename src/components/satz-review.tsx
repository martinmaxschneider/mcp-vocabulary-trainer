"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SatzPriority } from "@prisma/client";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Label } from "~/components/ui/label";
import { SessionSummary } from "~/components/session-summary";
import { PracticeModeButtons } from "~/components/practice-mode-buttons";
import { remainingBoxCounts } from "~/components/review-box-bar";
import { CahierQuizView } from "~/components/cahier-quiz-view";
import { useFocusLang } from "~/components/focus-lang-provider";
import { useCelebrate } from "~/components/gamification-provider";
import { CELEBRATIONS } from "~/lib/gamification-config";
import { groupDomainsByKind } from "~/lib/domain-catalog";
import { getTargetLang, SOURCE_LANG } from "~/lib/languages";
import { playbackUrls } from "~/lib/satz-tts";
import { MAX_BOX, MIN_BOX } from "~/lib/leitner";
import { cn } from "~/lib/utils";
import { Caveat, Libre_Baskerville } from "next/font/google";
import { Loader2 } from "lucide-react";

const caveat = Caveat({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
});

const libreBaskerville = Libre_Baskerville({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

type ReviewState = "setup" | "active" | "summary";

const PRIORITIES: SatzPriority[] = [
  "DAILY",
  "WEEKLY",
  "OCCASIONAL",
  "RARE",
];

export function SatzReview() {
  const t = useTranslations("sentences");
  const tReview = useTranslations("review");
  const tDomains = useTranslations("domains");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("languages");
  const { focusLang } = useFocusLang();
  const celebrate = useCelebrate();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [state, setState] = useState<ReviewState>("setup");
  const [practiceMode, setPracticeMode] = useState(false);
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
  const reportedSessionRef = useRef(false);

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
    { ...filters, limit: 30, practice: practiceMode || undefined },
    { enabled: state === "active" },
  );

  const reportSession = api.gamification.reportSession.useMutation({
    onSuccess: (data) => {
      celebrate(data, {
        perfectSession:
          session.answers >= (CELEBRATIONS.perfectSession.minCards ?? 10) &&
          session.correct === session.answers,
        sessionAnswers: session.answers,
      });
    },
  });

  const gradeMutation = api.satzReview.grade.useMutation({
    onSuccess: (data) => {
      if (data.gamification) celebrate(data.gamification);
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
    if (session.answers > 0 && !reportedSessionRef.current) {
      reportedSessionRef.current = true;
      reportSession.mutate({
        answers: session.answers,
        correct: session.correct,
      });
    }
    setState("summary");
  }, [state, queueQuery.isLoading, card, session.answers, session.correct]);

  const start = (practice = false) => {
    setPracticeMode(practice);
    setIndex(0);
    setRevealed(false);
    setCompletedBoxes([]);
    setSession({ answers: 0, correct: 0, xp: 0, streak: 0 });
    reportedSessionRef.current = false;
    setState("active");
  };

  useEffect(() => {
    if (searchParams.get("start") !== "1") return;
    start();
    router.replace("/sentences/review", { scroll: false });
  }, [searchParams, router]);

  if (state === "summary") {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
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
      <>
        <header className="mb-8 space-y-3">
          <p className={cn("text-lg text-red-600", caveat.className)}>
            {t("reviewCahierLabel")}
          </p>
          <h1
            className={cn(
              "text-4xl font-bold text-[#1e3a5f]",
              libreBaskerville.className,
            )}
          >
            {t("reviewTitle")}
          </h1>
          <p className="text-sm text-slate-600">{t("reviewSubtitle")}</p>
        </header>

        <section className="cahier-card space-y-6 p-6 sm:p-8">
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

          <p className="text-sm text-slate-600">
            {t("reviewDueCount", { count: due, language: tLang(focusLang) })}
          </p>
          <PracticeModeButtons
            onReview={() => start(false)}
            onPractice={() => start(true)}
            onListen={() => router.push("/sentences/listen")}
            reviewDisabled={due === 0}
          />
        </section>
        {themeDomains.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{tDomains("kindTHEME")}</p>
        ) : null}
      </>
    );
  }

  const totalAvailable = queueQuery.data?.totalAvailable ?? cards.length;
  const cardsLeft = Math.max(0, totalAvailable - session.answers - 1);
  const focusMeta = getTargetLang(focusLang);

  if (queueQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="cahier-card py-16 text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-[#1e3a5f]" />
          <p className="text-slate-600">{tReview("loadingCards")}</p>
        </div>
      </div>
    );
  }

  if (!card && session.answers === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="cahier-card py-16 text-center">
          <h2
            className={cn(
              "mb-2 text-2xl font-bold text-[#1e3a5f]",
              libreBaskerville.className,
            )}
          >
            {tReview("allCaughtUp")}
          </h2>
          <p className="mb-6 text-slate-600">{tReview("allCaughtUpDesc")}</p>
          <Button
            variant="ghost"
            onClick={() => setState("setup")}
            className="text-[#1e3a5f]"
          >
            {tReview("backToSetup")}
          </Button>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="cahier-card py-16 text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-[#1e3a5f]" />
        </div>
      </div>
    );
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
    <CahierQuizView
      kicker={t("reviewCahierLabel")}
      cardsLeft={cardsLeft}
      langPill={
        <>
          {focusMeta?.flag} {tLang(focusLang)}
        </>
      }
      onBack={() => setState("setup")}
      remainingBoxes={remaining}
      cardKey={card.satzId}
      badges={[
        { label: tCommon("box", { number: card.box }), variant: "secondary" },
        { label: t(`priority${card.priority}`) },
        ...card.domains.map((domain) => ({ label: domain.name })),
      ]}
      prompt={card.mainText}
      subtitle={card.trigger}
      promptAudio={{
        urls: mainClips,
        langCode: SOURCE_LANG.code,
        label: t("playAudioLang", { language: tLang(SOURCE_LANG.code) }),
      }}
      mode="selfGrade"
      revealed={revealed}
      answer={translation?.text}
      answerAudio={{
        urls: translationClips,
        langCode: focusLang,
        label: t("playAudioLang", { language: tLang(focusLang) }),
      }}
      pending={gradeMutation.isPending}
      onReveal={() => setRevealed(true)}
      onKnew={() =>
        gradeMutation.mutate({
          satzId: card.satzId,
          targetLang: focusLang,
          isCorrect: true,
          skipProgress: practiceMode || undefined,
        })
      }
      onDidNotKnow={() =>
        gradeMutation.mutate({
          satzId: card.satzId,
          targetLang: focusLang,
          isCorrect: false,
          skipProgress: practiceMode || undefined,
        })
      }
    />
  );
}

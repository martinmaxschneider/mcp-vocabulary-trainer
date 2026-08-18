"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SOURCE_LANG, TARGET_LANG_CODES } from "~/lib/languages";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { ReviewCard } from "~/components/review-card";
import {
  MultiReviewCard,
  type MultiLangResult,
} from "~/components/multi-review-card";
import { useToast } from "~/hooks/use-toast";
import { ArrowLeft, CheckCircle, Globe, Play } from "lucide-react";
import { getTargetLang } from "~/lib/languages";
import { resolveErrorCode } from "~/lib/trpc-error";
import { PronunciationGuideMenu } from "~/components/clickable-ipa";
import { cn } from "~/lib/utils";
import { useFocusLang } from "~/components/focus-lang-provider";
import { useCelebrate } from "~/components/gamification-provider";
import { SessionSummary } from "~/components/session-summary";
import { CELEBRATIONS } from "~/lib/gamification-config";
import {
  ReviewBoxBar,
  remainingBoxCounts,
} from "~/components/review-box-bar";
import { Caveat, Libre_Baskerville } from "next/font/google";
import { groupDomainsByKind } from "~/lib/domain-catalog";

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
type ReviewMode = "single" | "multi";

export function ReviewSession() {
  const t = useTranslations("review");
  const tDomains = useTranslations("domains");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("languages");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const celebrate = useCelebrate();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { focusLang } = useFocusLang();
  const [reviewState, setReviewState] = useState<ReviewState>("setup");
  const [mode, setMode] = useState<ReviewMode>("single");
  const selectedLang = mode === "multi" ? null : focusLang;
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [result, setResult] = useState<{
    isCorrect: boolean;
    expected: string;
    typo: boolean;
  } | null>(null);
  const [multiResults, setMultiResults] = useState<MultiLangResult[] | null>(
    null
  );
  const [session, setSession] = useState({ answers: 0, correct: 0, xp: 0, streak: 0 });

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrors(code as "NOT_FOUND") : message;
  };

  const { data: domains } = api.domain.list.useQuery();

  useEffect(() => {
    if (searchParams.get("start") !== "1") return;
    const nextMode = searchParams.get("mode") === "multi" ? "multi" : "single";
    setMode(nextMode);
    setSelectedDomains([]);
    setCurrentIndex(0);
    setResult(null);
    setMultiResults(null);
    setSession({ answers: 0, correct: 0, xp: 0, streak: 0 });
    setReviewState("active");
    router.replace("/review", { scroll: false });
  }, [searchParams, router]);

  const singleQuery = api.review.getDue.useQuery(
    {
      targetLang: selectedLang!,
      domainIds: selectedDomains.length > 0 ? selectedDomains : undefined,
      limit: 20,
    },
    {
      enabled:
        reviewState === "active" && mode === "single" && selectedLang !== null,
    }
  );

  const multiQuery = api.review.getDueMulti.useQuery(
    {
      domainIds: selectedDomains.length > 0 ? selectedDomains : undefined,
      limit: 20,
    },
    {
      enabled: reviewState === "active" && mode === "multi",
    }
  );

  const isLoading =
    mode === "multi" ? multiQuery.isLoading : singleQuery.isLoading;
  const refetch =
    mode === "multi" ? multiQuery.refetch : singleQuery.refetch;

  const singleCards = singleQuery.data?.cards ?? [];
  const multiCards = multiQuery.data?.cards ?? [];
  const totalAvailable =
    mode === "multi"
      ? (multiQuery.data?.totalAvailable ?? 0)
      : (singleQuery.data?.totalAvailable ?? 0);
  const totalCards =
    mode === "multi" ? multiCards.length : singleCards.length;

  const sessionBoxCounts = remainingBoxCounts(
    mode === "multi"
      ? multiQuery.data?.boxCounts
      : singleQuery.data?.boxCounts,
    (mode === "multi" ? multiCards : singleCards)
      .slice(0, currentIndex)
      .map((card) =>
        "box" in card
          ? card.box
          : Math.min(...card.languages.map((lang) => lang.box)),
      ),
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

  const submitMutation = api.review.submitAnswer.useMutation({
    onSuccess: (data) => {
      celebrate(data.gamification);
      setSession((prev) => ({
        answers: prev.answers + 1,
        correct: prev.correct + (data.isCorrect ? 1 : 0),
        xp: prev.xp + (data.gamification?.xpEarned ?? 0),
        streak: data.gamification?.streak ?? prev.streak,
      }));
      setResult({
        isCorrect: data.isCorrect,
        expected: data.expected,
        typo: data.typo,
      });
    },
    onError: (error) => {
      toast({
        title: t("submitError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const submitMultiMutation = api.review.submitMultiAnswers.useMutation({
    onSuccess: (data) => {
      celebrate(data.gamification);
      setSession((prev) => ({
        answers: prev.answers + data.results.length,
        correct: prev.correct + data.results.filter((r) => r.isCorrect).length,
        xp: prev.xp + (data.gamification?.xpEarned ?? 0),
        streak: data.gamification?.streak ?? prev.streak,
      }));
      setMultiResults(
        data.results.map((r) => ({
          targetLang: r.targetLang,
          isCorrect: r.isCorrect,
          expected: r.expected,
          ipa: r.ipa,
          typo: r.typo,
        }))
      );
    },
    onError: (error) => {
      toast({
        title: t("submitError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const markAsWrongMutation = api.review.markAsWrong.useMutation({
    onSuccess: (data, variables) => {
      if (mode === "multi") {
        setMultiResults((prev) =>
          prev
            ? prev.map((r) =>
                r.targetLang === variables.targetLang
                  ? {
                      ...r,
                      isCorrect: false,
                      expected: data.expected,
                      typo: false,
                    }
                  : r
              )
            : prev
        );
      } else {
        setResult({
          isCorrect: false,
          expected: data.expected,
          typo: false,
        });
      }
    },
    onError: (error) => {
      toast({
        title: t("markWrongError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const markAsCorrectMutation = api.review.markAsCorrect.useMutation({
    onSuccess: (data, variables) => {
      if (mode === "multi") {
        setMultiResults((prev) =>
          prev
            ? prev.map((r) =>
                r.targetLang === variables.targetLang
                  ? {
                      ...r,
                      isCorrect: true,
                      expected: data.expected,
                      typo: false,
                    }
                  : r
              )
            : prev
        );
      } else {
        setResult({
          isCorrect: true,
          expected: data.expected,
          typo: false,
        });
      }
    },
    onError: (error) => {
      toast({
        title: t("markCorrectError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (answer: string) => {
    const currentCard = singleCards[currentIndex];
    if (!currentCard || !selectedLang) return;

    submitMutation.mutate({
      entryId: currentCard.entryId,
      targetLang: selectedLang,
      userAnswer: answer,
    });
  };

  const handleShowSolution = () => {
    const currentCard = singleCards[currentIndex];
    if (!currentCard || !selectedLang) return;

    submitMutation.mutate({
      entryId: currentCard.entryId,
      targetLang: selectedLang,
      userAnswer: "",
    });
  };

  const handleMarkAsWrong = () => {
    const currentCard = singleCards[currentIndex];
    if (!currentCard || !selectedLang || !result) return;

    markAsWrongMutation.mutate({
      entryId: currentCard.entryId,
      targetLang: selectedLang,
    });
  };

  const handleMarkAsCorrect = () => {
    const currentCard = singleCards[currentIndex];
    if (!currentCard || !selectedLang || !result) return;

    markAsCorrectMutation.mutate({
      entryId: currentCard.entryId,
      targetLang: selectedLang,
    });
  };

  const handleMultiSubmit = (
    answers: Array<{ targetLang: string; userAnswer: string }>
  ) => {
    const currentCard = multiCards[currentIndex];
    if (!currentCard) return;

    submitMultiMutation.mutate({
      entryId: currentCard.entryId,
      answers,
    });
  };

  const handleMultiShowSolution = () => {
    const currentCard = multiCards[currentIndex];
    if (!currentCard) return;

    submitMultiMutation.mutate({
      entryId: currentCard.entryId,
      answers: currentCard.languages.map((lang) => ({
        targetLang: lang.targetLang,
        userAnswer: "",
      })),
    });
  };

  const handleMultiMarkAsWrong = (targetLang: string) => {
    const currentCard = multiCards[currentIndex];
    if (!currentCard || !multiResults) return;

    markAsWrongMutation.mutate({
      entryId: currentCard.entryId,
      targetLang,
    });
  };

  const handleMultiMarkAsCorrect = (targetLang: string) => {
    const currentCard = multiCards[currentIndex];
    if (!currentCard || !multiResults) return;

    markAsCorrectMutation.mutate({
      entryId: currentCard.entryId,
      targetLang,
    });
  };

  const finishSession = () => {
    if (session.answers > 0) {
      reportSession.mutate({
        answers: session.answers,
        correct: session.correct,
      });
      setReviewState("summary");
      return;
    }
    setReviewState("setup");
  };

  const handleNext = () => {
    if (totalCards === 0) return;

    if (currentIndex < totalCards - 1) {
      setCurrentIndex(currentIndex + 1);
      setResult(null);
      setMultiResults(null);
    } else {
      void refetch().then((result) => {
        const remaining = result.data?.cards.length ?? 0;
        setCurrentIndex(0);
        setResult(null);
        setMultiResults(null);
        if (remaining === 0) {
          finishSession();
          return;
        }
        toast({
          title: t("sessionComplete"),
          description: t("sessionCompleteDesc"),
        });
      });
    }
  };

  const handleStartReview = () => {
    setMode("single");
    setReviewState("active");
    setCurrentIndex(0);
    setResult(null);
    setMultiResults(null);
    setSession({ answers: 0, correct: 0, xp: 0, streak: 0 });
  };

  const handleBackToSetup = () => {
    setReviewState("setup");
    setMode("single");
    setSelectedDomains([]);
    setCurrentIndex(0);
    setResult(null);
    setMultiResults(null);
    setSession({ answers: 0, correct: 0, xp: 0, streak: 0 });
  };

  const toggleDomain = (domainId: string) => {
    setSelectedDomains((prev) =>
      prev.includes(domainId)
        ? prev.filter((id) => id !== domainId)
        : [...prev, domainId]
    );
  };

  const toggleAllDomains = () => {
    if (selectedDomains.length === (domains?.length ?? 0)) {
      setSelectedDomains([]);
    } else {
      setSelectedDomains(domains?.map((d) => d.id) ?? []);
    }
  };

  const currentSingleCard = singleCards[currentIndex];
  const currentMultiCard = multiCards[currentIndex];

  const guideTargetLangs = useMemo(() => {
    if (mode === "single" && selectedLang) return [selectedLang];
    const cardLangs = currentMultiCard?.languages.map((l) => l.targetLang);
    if (mode === "multi" && cardLangs && cardLangs.length > 0) {
      return cardLangs;
    }
    return [...TARGET_LANG_CODES];
  }, [mode, selectedLang, currentMultiCard]);

  const guidesQuery = api.pronunciation.getByPairs.useQuery(
    {
      nativeLang: SOURCE_LANG.code,
      targetLangs: guideTargetLangs,
    },
    {
      enabled: reviewState === "active" && guideTargetLangs.length > 0,
    },
  );

  const pronunciationOptions = useMemo(() => {
    return guideTargetLangs.map((lang) => {
      const entry = guidesQuery.data?.guides.find((g) => g.targetLang === lang);
      return {
        lang,
        label: tLang(lang),
        flag: getTargetLang(lang)?.flag,
        items: entry?.guide?.items ?? [],
      };
    });
  }, [guideTargetLangs, guidesQuery.data, tLang]);

  // Setup Phase
  if (reviewState === "setup") {
    return (
      <>
        <header className="mb-8 space-y-3">
          <p className={cn("text-lg text-red-600", caveat.className)}>
            {t("cahierLabel")}
          </p>
          <h1
            className={cn(
              "text-4xl font-bold text-[#1e3a5f]",
              libreBaskerville.className,
            )}
          >
            {t("setupTitle")}
          </h1>
          <p className="text-sm text-slate-600">{t("setupSubtitle")}</p>
        </header>

        <section className="cahier-card p-6 sm:p-8">
            <div className="space-y-6">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-[#1e3a5f]">
                    {t("selectDomains")}
                  </h3>
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-[#1e3a5f]"
                    onClick={toggleAllDomains}
                  >
                    {selectedDomains.length === (domains?.length ?? 0)
                      ? tCommon("deselectAll")
                      : tCommon("selectAll")}
                  </button>
                </div>
                {domains && domains.length > 0 ? (
                  <div className="space-y-4 p-1">
                    {groupDomainsByKind(domains).map((group) => (
                      <div key={group.kind} className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {tDomains(`kind${group.kind}`)}
                        </h4>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {group.domains.map((domain) => (
                            <button
                              key={domain.id}
                              type="button"
                              className={cn(
                                "flex items-center gap-3 rounded-xl border p-3 text-left transition",
                                selectedDomains.includes(domain.id)
                                  ? "border-[#1e3a5f] bg-[#1e3a5f]/5"
                                  : "border-slate-200 bg-white hover:border-[#1e3a5f]/30",
                              )}
                              onClick={() => toggleDomain(domain.id)}
                            >
                              <span
                                className={cn(
                                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                  selectedDomains.includes(domain.id)
                                    ? "border-[#1e3a5f] bg-[#1e3a5f]"
                                    : "border-slate-300 bg-white",
                                )}
                              />
                              <span className="font-medium text-[#1e3a5f]">
                                {domain.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{t("noDomains")}</p>
                )}
                <p className="mt-2 text-xs text-slate-500">{t("leaveEmpty")}</p>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleStartReview}
                  size="lg"
                  className="bg-[#1e3a5f] text-white hover:bg-[#16304d]"
                >
                  <Play className="mr-2 h-5 w-5" />
                  {t("startSession")}
                </Button>
              </div>
            </div>
        </section>
      </>
    );
  }

  if (reviewState === "summary") {
    return (
      <div className="mx-auto max-w-3xl">
        <SessionSummary
          answers={session.answers}
          correct={session.correct}
          xp={session.xp}
          streak={session.streak}
          perfect={
            session.answers >= (CELEBRATIONS.perfectSession.minCards ?? 10) &&
            session.correct === session.answers
          }
          onDone={handleBackToSetup}
        />
      </div>
    );
  }

  const isSubmitting =
    submitMutation.isPending ||
    submitMultiMutation.isPending ||
    markAsWrongMutation.isPending ||
    markAsCorrectMutation.isPending;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBackToSetup}
          className="text-[#1e3a5f] hover:bg-white/70 hover:text-[#1e3a5f]"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("backToSetup")}
        </Button>
        <div className="flex items-center gap-2">
          {!isLoading && totalCards > 0 ? (
            <span className="text-sm font-medium text-[#1e3a5f]">
              {totalAvailable - currentIndex - 1 === 0
                ? t("lastCard")
                : t("cardsLeft", {
                    count: totalAvailable - currentIndex - 1,
                  })}
            </span>
          ) : null}
          <span className="rounded-md bg-slate-200/80 px-2.5 py-1 text-xs text-slate-700">
            {mode === "multi" ? (
              <span className="inline-flex items-center gap-1">
                <Globe className="h-3.5 w-3.5" />
                {t("quickStartAllLanguages")}
              </span>
            ) : (
              <>
                {getTargetLang(selectedLang ?? "")?.flag}{" "}
                {selectedLang ? tLang(selectedLang) : null}
              </>
            )}
          </span>
          {!isLoading && totalCards > 0 ? (
            <PronunciationGuideMenu options={pronunciationOptions} />
          ) : null}
        </div>
      </div>

      <p
        className={cn(
          "mb-3 text-center text-base text-red-600",
          caveat.className,
        )}
      >
        {t("cahierLabel")}
      </p>
      {!isLoading && totalCards > 0 ? (
        <div className="mb-6">
          <ReviewBoxBar remaining={sessionBoxCounts} />
        </div>
      ) : null}

      <div>
        {isLoading ? (
          <div className="cahier-card py-16 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#1e3a5f]" />
              <p className="text-slate-600">{t("loadingCards")}</p>
            </div>
          </div>
        ) : totalCards === 0 ? (
          <div className="cahier-card py-16 text-center">
            <CheckCircle className="mx-auto mb-4 h-12 w-12 text-emerald-600" />
            <h2
              className={cn(
                "mb-2 text-2xl font-bold text-[#1e3a5f]",
                libreBaskerville.className,
              )}
            >
              {t("allCaughtUp")}
            </h2>
            <p className="mb-6 text-slate-600">{t("allCaughtUpDesc")}</p>
            <div className="flex justify-center gap-4">
              <Button
                onClick={() => void refetch()}
                className="bg-[#1e3a5f] text-white hover:bg-[#16304d]"
              >
                {tCommon("refresh")}
              </Button>
              <Button
                variant="ghost"
                onClick={handleBackToSetup}
                className="text-[#1e3a5f] hover:bg-slate-100"
              >
                {t("backToSetup")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {mode === "single" && currentSingleCard && selectedLang && (
              <ReviewCard
                entryId={currentSingleCard.entryId}
                mainText={currentSingleCard.mainText}
                type={currentSingleCard.type}
                note={currentSingleCard.note}
                ipa={currentSingleCard.translation?.ipa}
                box={currentSingleCard.box}
                targetLang={selectedLang}
                onSubmit={handleSubmit}
                onShowSolution={handleShowSolution}
                onMarkAsWrong={handleMarkAsWrong}
                onMarkAsCorrect={handleMarkAsCorrect}
                onExpectedUpdated={(text) =>
                  setResult((prev) => (prev ? { ...prev, expected: text } : prev))
                }
                onNext={handleNext}
                isSubmitting={isSubmitting}
                result={result}
              />
            )}

            {mode === "multi" && currentMultiCard && (
              <MultiReviewCard
                entryId={currentMultiCard.entryId}
                mainText={currentMultiCard.mainText}
                type={currentMultiCard.type}
                note={currentMultiCard.note}
                languages={currentMultiCard.languages}
                onSubmit={handleMultiSubmit}
                onShowSolution={handleMultiShowSolution}
                onMarkAsWrong={handleMultiMarkAsWrong}
                onMarkAsCorrect={handleMultiMarkAsCorrect}
                onExpectedUpdated={(targetLang, text) =>
                  setMultiResults((prev) =>
                    prev
                      ? prev.map((r) =>
                          r.targetLang === targetLang
                            ? { ...r, expected: text }
                            : r,
                        )
                      : prev,
                  )
                }
                onNext={handleNext}
                isSubmitting={isSubmitting}
                results={multiResults}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

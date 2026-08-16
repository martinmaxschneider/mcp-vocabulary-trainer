"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SOURCE_LANG, TARGET_LANGS, TARGET_LANG_CODES } from "~/lib/languages";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { ReviewCard } from "~/components/review-card";
import {
  MultiReviewCard,
  type MultiLangResult,
} from "~/components/multi-review-card";
import { useToast } from "~/hooks/use-toast";
import { BookOpen, CheckCircle, Globe, Play } from "lucide-react";
import { getTargetLang } from "~/lib/languages";
import { resolveErrorCode } from "~/lib/trpc-error";
import { PronunciationGuideMenu } from "~/components/clickable-ipa";
import { cn } from "~/lib/utils";
import { useFocusLang } from "~/components/focus-lang-provider";
import { Caveat, Libre_Baskerville } from "next/font/google";

const caveat = Caveat({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
});

const libreBaskerville = Libre_Baskerville({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

type ReviewState = "setup" | "active";
type ReviewMode = "single" | "multi";

export default function ReviewPage() {
  const t = useTranslations("review");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("languages");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const { focusLang, setFocusLang } = useFocusLang();
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

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrors(code as "NOT_FOUND") : message;
  };

  const { data: domains } = api.domain.list.useQuery();

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

  const submitMutation = api.review.submitAnswer.useMutation({
    onSuccess: (data) => {
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

  const handleNext = () => {
    if (totalCards === 0) return;

    if (currentIndex < totalCards - 1) {
      setCurrentIndex(currentIndex + 1);
      setResult(null);
      setMultiResults(null);
    } else {
      void refetch();
      setCurrentIndex(0);
      setResult(null);
      setMultiResults(null);
      toast({
        title: t("sessionComplete"),
        description: t("sessionCompleteDesc"),
      });
    }
  };

  const handleStartReview = () => {
    if (!selectedLang) {
      toast({
        title: t("selectLangToast"),
        variant: "destructive",
      });
      return;
    }
    setMode("single");
    setReviewState("active");
    setCurrentIndex(0);
    setResult(null);
    setMultiResults(null);
  };

  const handleBackToSetup = () => {
    setReviewState("setup");
    setMode("single");
    setSelectedDomains([]);
    setCurrentIndex(0);
    setResult(null);
    setMultiResults(null);
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
                <h3 className="mb-3 font-semibold text-[#1e3a5f]">
                  {t("selectLanguage")}
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {TARGET_LANGS.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      className={cn(
                        "flex h-auto flex-col items-center gap-1 rounded-xl border px-3 py-4 transition",
                        selectedLang === lang.code
                          ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                          : "border-slate-200 bg-white text-[#1e3a5f] hover:border-[#1e3a5f]/40",
                      )}
                      onClick={() => setFocusLang(lang.code)}
                    >
                      <span className="text-2xl">{lang.flag}</span>
                      <span className="text-sm">{tLang(lang.code)}</span>
                    </button>
                  ))}
                </div>
              </div>

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
                  <div className="grid max-h-64 grid-cols-1 gap-3 overflow-y-auto p-1 sm:grid-cols-2 lg:grid-cols-3">
                    {domains.map((domain) => (
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
                ) : (
                  <p className="text-sm text-slate-500">{t("noDomains")}</p>
                )}
                <p className="mt-2 text-xs text-slate-500">{t("leaveEmpty")}</p>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleStartReview}
                  disabled={!selectedLang}
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

  const isSubmitting =
    submitMutation.isPending ||
    submitMultiMutation.isPending ||
    markAsWrongMutation.isPending ||
    markAsCorrectMutation.isPending;

  return (
    <>
      <header className="mb-8 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <p className={cn("text-lg text-red-600", caveat.className)}>
              {t("cahierLabel")}
            </p>
            <h1
              className={cn(
                "text-4xl font-bold text-[#1e3a5f]",
                libreBaskerville.className,
              )}
            >
              {t("sessionTitle")}
            </h1>
            <p className="text-sm text-slate-600">{t("sessionSubtitle")}</p>
          </div>
          <Button
            variant="ghost"
            onClick={handleBackToSetup}
            className="text-[#1e3a5f] hover:bg-white/70 hover:text-[#1e3a5f]"
          >
            {t("backToSetup")}
          </Button>
        </div>
      </header>

      <div className="space-y-6">
        {isLoading ? (
          <div className="cahier-card py-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#1e3a5f]" />
              <p className="text-slate-600">{t("loadingCards")}</p>
            </div>
          </div>
        ) : totalCards === 0 ? (
          <div className="cahier-card py-12 text-center">
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
            <div className="flex items-center justify-between text-[#1e3a5f]">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                <span className="font-medium">
                  {totalAvailable - currentIndex - 1 === 0
                    ? t("lastCard")
                    : t("cardsLeft", {
                        count: totalAvailable - currentIndex - 1,
                      })}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <PronunciationGuideMenu options={pronunciationOptions} />
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
              </div>
            </div>

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
    </>
  );
}

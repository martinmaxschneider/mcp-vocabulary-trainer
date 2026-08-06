"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { TARGET_LANGS } from "~/lib/languages";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { ReviewCard } from "~/components/review-card";
import {
  MultiReviewCard,
  type MultiLangResult,
} from "~/components/multi-review-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { useToast } from "~/hooks/use-toast";
import { BookOpen, CheckCircle, Globe, Languages, Play } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { getTargetLang } from "~/lib/languages";
import { resolveErrorCode } from "~/lib/trpc-error";

type ReviewState = "setup" | "active";
type ReviewMode = "single" | "multi";

export default function ReviewPage() {
  const t = useTranslations("review");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("languages");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const [reviewState, setReviewState] = useState<ReviewState>("setup");
  const [mode, setMode] = useState<ReviewMode>("single");
  const [selectedLang, setSelectedLang] = useState<string | null>(null);
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

  const handleQuickStart = (lang: string) => {
    setMode("single");
    setSelectedLang(lang);
    setSelectedDomains([]);
    setReviewState("active");
    setCurrentIndex(0);
    setResult(null);
    setMultiResults(null);
  };

  const handleQuickStartAll = () => {
    setMode("multi");
    setSelectedLang(null);
    setSelectedDomains([]);
    setReviewState("active");
    setCurrentIndex(0);
    setResult(null);
    setMultiResults(null);
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
    setSelectedLang(null);
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

  // Setup Phase
  if (reviewState === "setup") {
    return (
      <>
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold">{t("setupTitle")}</h1>
          <p className="text-muted-foreground">{t("setupSubtitle")}</p>
        </div>

        <div className="mx-auto max-w-5xl space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5" />
                {t("quickStart")}
              </CardTitle>
              <CardDescription>{t("quickStartDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                variant="default"
                size="lg"
                className="h-auto w-full py-6 flex flex-col items-center gap-2"
                onClick={handleQuickStartAll}
              >
                <Globe className="h-8 w-8" />
                <span className="font-semibold">
                  {t("quickStartAllLanguages")}
                </span>
                <span className="text-sm font-normal opacity-90">
                  {t("quickStartAllLanguagesDesc")}
                </span>
              </Button>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {TARGET_LANGS.map((lang) => (
                  <Button
                    key={lang.code}
                    variant="outline"
                    size="lg"
                    className="h-auto py-6 flex flex-col items-center gap-2"
                    onClick={() => handleQuickStart(lang.code)}
                  >
                    <span className="text-4xl">{lang.flag}</span>
                    <span className="font-semibold">
                      {tLang(lang.code)}
                    </span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Languages className="h-5 w-5" />
                {t("customSetup")}
              </CardTitle>
              <CardDescription>{t("customSetupDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="mb-3 font-semibold">
                  {t("selectLanguage")}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {TARGET_LANGS.map((lang) => (
                    <Button
                      key={lang.code}
                      variant={
                        selectedLang === lang.code ? "default" : "outline"
                      }
                      className="h-auto py-4 flex flex-col items-center gap-1"
                      onClick={() => setSelectedLang(lang.code)}
                    >
                      <span className="text-2xl">{lang.flag}</span>
                      <span className="text-sm">{tLang(lang.code)}</span>
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold">{t("selectDomains")}</h3>
                  <Button variant="ghost" size="sm" onClick={toggleAllDomains}>
                    {selectedDomains.length === (domains?.length ?? 0)
                      ? tCommon("deselectAll")
                      : tCommon("selectAll")}
                  </Button>
                </div>
                {domains && domains.length > 0 ? (
                  <div className="grid max-h-64 grid-cols-1 gap-3 overflow-y-auto p-1 sm:grid-cols-2 lg:grid-cols-3">
                    {domains.map((domain) => (
                      <div
                        key={domain.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                          selectedDomains.includes(domain.id)
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => toggleDomain(domain.id)}
                      >
                        <input
                          type="checkbox"
                          checked={selectedDomains.includes(domain.id)}
                          onChange={() => toggleDomain(domain.id)}
                          className="h-4 w-4 cursor-pointer"
                        />
                        <span className="font-medium">{domain.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("noDomains")}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("leaveEmpty")}
                </p>
              </div>

              <Button
                onClick={handleStartReview}
                disabled={!selectedLang}
                size="lg"
                className="w-full"
              >
                <Play className="mr-2 h-5 w-5" />
                {t("startSession")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const isSubmitting =
    submitMutation.isPending ||
    submitMultiMutation.isPending ||
    markAsWrongMutation.isPending;

  return (
    <>
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="mb-2 text-4xl font-bold">{t("sessionTitle")}</h1>
            <p className="text-muted-foreground">{t("sessionSubtitle")}</p>
          </div>
          <Button variant="outline" onClick={handleBackToSetup}>
            {t("backToSetup")}
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-6">
        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
                <p className="text-muted-foreground">{t("loadingCards")}</p>
              </div>
            </CardContent>
          </Card>
        ) : totalCards === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle className="mx-auto mb-4 h-12 w-12 text-green-600" />
              <h2 className="mb-2 text-2xl font-bold">{t("allCaughtUp")}</h2>
              <p className="mb-6 text-muted-foreground">
                {t("allCaughtUpDesc")}
              </p>
              <div className="flex justify-center gap-4">
                <Button onClick={() => void refetch()}>
                  {tCommon("refresh")}
                </Button>
                <Button variant="outline" onClick={handleBackToSetup}>
                  {t("backToSetup")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <span className="font-medium">
                  {totalAvailable - currentIndex - 1 === 0
                    ? t("lastCard")
                    : t("cardsLeft", {
                        count: totalAvailable - currentIndex - 1,
                      })}
                </span>
              </div>
              <Badge variant="secondary">
                {mode === "multi" ? (
                  <>
                    <Globe className="mr-1 h-3.5 w-3.5" />
                    {t("quickStartAllLanguages")}
                  </>
                ) : (
                  <>
                    {getTargetLang(selectedLang ?? "")?.flag}{" "}
                    {selectedLang ? tLang(selectedLang) : null}
                  </>
                )}
              </Badge>
            </div>

            {mode === "single" && currentSingleCard && selectedLang && (
              <ReviewCard
                mainText={currentSingleCard.mainText}
                type={currentSingleCard.type}
                note={currentSingleCard.note}
                ipa={currentSingleCard.translation?.ipa}
                box={currentSingleCard.box}
                targetLang={selectedLang}
                onSubmit={handleSubmit}
                onShowSolution={handleShowSolution}
                onMarkAsWrong={handleMarkAsWrong}
                onNext={handleNext}
                isSubmitting={isSubmitting}
                result={result}
              />
            )}

            {mode === "multi" && currentMultiCard && (
              <MultiReviewCard
                mainText={currentMultiCard.mainText}
                type={currentMultiCard.type}
                note={currentMultiCard.note}
                languages={currentMultiCard.languages}
                onSubmit={handleMultiSubmit}
                onShowSolution={handleMultiShowSolution}
                onMarkAsWrong={handleMultiMarkAsWrong}
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

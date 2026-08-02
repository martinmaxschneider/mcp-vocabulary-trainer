"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { getTargetLang } from "~/lib/languages";

export type MultiLangResult = {
  targetLang: string;
  isCorrect: boolean;
  expected: string;
  typo: boolean;
};

interface MultiReviewCardProps {
  mainText: string;
  type: "WORD" | "PROVERB";
  note?: string | null;
  languages: Array<{ targetLang: string; box: number }>;
  onSubmit: (answers: Array<{ targetLang: string; userAnswer: string }>) => void;
  onShowSolution?: () => void;
  onMarkAsWrong?: (targetLang: string) => void;
  onNext?: () => void;
  isSubmitting: boolean;
  results?: MultiLangResult[] | null;
}

export function MultiReviewCard({
  mainText,
  type,
  note,
  languages,
  onSubmit,
  onShowSolution,
  onMarkAsWrong,
  onNext,
  isSubmitting,
  results,
}: MultiReviewCardProps) {
  const t = useTranslations("review");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("languages");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    setAnswers({});
  }, [mainText]);

  const hasAnyAnswer = languages.some(
    (lang) => (answers[lang.targetLang] ?? "").trim().length > 0
  );

  const handleSubmit = () => {
    if (!hasAnyAnswer) return;
    onSubmit(
      languages.map((lang) => ({
        targetLang: lang.targetLang,
        userAnswer: (answers[lang.targetLang] ?? "").trim(),
      }))
    );
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    index: number
  ) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    if (results) {
      onNext?.();
      return;
    }

    if (index < languages.length - 1) {
      inputRefs.current[index + 1]?.focus();
    } else {
      handleSubmit();
    }
  };

  useEffect(() => {
    if (results && onNext) {
      const handleGlobalKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          onNext();
        }
      };
      window.addEventListener("keydown", handleGlobalKeyDown);
      return () => window.removeEventListener("keydown", handleGlobalKeyDown);
    }
  }, [results, onNext]);

  const correctCount = results?.filter((r) => r.isCorrect).length ?? 0;
  const totalCount = results?.length ?? 0;
  const allCorrect = results != null && correctCount === totalCount && totalCount > 0;

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl">{mainText}</CardTitle>
          <Badge variant="outline">{type}</Badge>
        </div>
        {note && <p className="text-sm text-muted-foreground mt-2">{note}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        {!results ? (
          <>
            <div className="space-y-3">
              {languages.map((lang, index) => {
                const meta = getTargetLang(lang.targetLang);
                return (
                  <div key={lang.targetLang} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor={`multi-answer-${lang.targetLang}`}
                        className="text-sm font-medium flex items-center gap-2"
                      >
                        <span>{meta?.flag}</span>
                        <span>{tLang(lang.targetLang)}</span>
                      </label>
                      <Badge variant="secondary" className="text-xs">
                        {tCommon("box", { number: lang.box })}
                      </Badge>
                    </div>
                    <Input
                      id={`multi-answer-${lang.targetLang}`}
                      ref={(el) => {
                        inputRefs.current[index] = el;
                      }}
                      placeholder={t("answerPlaceholder")}
                      value={answers[lang.targetLang] ?? ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [lang.targetLang]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => handleKeyDown(e, index)}
                      disabled={isSubmitting}
                      autoFocus={index === 0}
                      className="text-lg"
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !hasAnyAnswer}
                className="flex-1"
                size="lg"
              >
                {isSubmitting ? t("checking") : t("checkAnswer")}
              </Button>
              {onShowSolution && (
                <Button
                  onClick={onShowSolution}
                  disabled={isSubmitting}
                  variant="outline"
                  size="lg"
                >
                  {t("showSolution")}
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <p className="text-sm font-medium text-muted-foreground">
              {t("multiCorrectSummary", {
                correct: correctCount,
                total: totalCount,
              })}
            </p>

            <div className="space-y-3">
              {results.map((result) => {
                const meta = getTargetLang(result.targetLang);
                const userAnswer = answers[result.targetLang] ?? "";
                return (
                  <div
                    key={result.targetLang}
                    className={`flex items-start gap-3 p-4 rounded-lg ${
                      result.isCorrect
                        ? "bg-green-50 dark:bg-green-950"
                        : "bg-red-50 dark:bg-red-950"
                    }`}
                  >
                    {result.isCorrect ? (
                      <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                    ) : (
                      <XCircle className="h-5 w-5 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold flex items-center gap-2">
                          <span>{meta?.flag}</span>
                          <span>{tLang(result.targetLang)}</span>
                          <span className="font-normal text-muted-foreground">
                            — {result.isCorrect ? t("correct") : t("incorrect")}
                          </span>
                        </p>
                        {result.isCorrect && onMarkAsWrong && (
                          <Button
                            onClick={() => onMarkAsWrong(result.targetLang)}
                            variant="outline"
                            size="sm"
                            disabled={isSubmitting}
                          >
                            {t("markAsWrong")}
                          </Button>
                        )}
                      </div>
                      <div className="mt-2 space-y-1">
                        <p className="text-sm">
                          <span className="text-muted-foreground">
                            {t("yourAnswer")}
                          </span>{" "}
                          <span
                            className={`font-medium ${
                              result.isCorrect
                                ? "text-green-600 dark:text-green-400"
                                : "text-red-600 dark:text-red-400"
                            }`}
                          >
                            {userAnswer || "—"}
                          </span>
                        </p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">
                            {t("expected")}
                          </span>{" "}
                          <span className="font-medium text-foreground">
                            {result.expected}
                          </span>
                        </p>
                      </div>
                      {result.typo && (
                        <div className="flex items-center gap-1 mt-2 text-sm text-yellow-600 dark:text-yellow-400">
                          <AlertCircle className="h-4 w-4" />
                          <span>{t("typoNote")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {onNext && (
              <Button onClick={onNext} size="sm" className="w-full">
                {allCorrect ? t("nextCard") : t("continue")}
              </Button>
            )}

            <p className="text-xs text-center text-muted-foreground">
              {t("enterToContinue")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

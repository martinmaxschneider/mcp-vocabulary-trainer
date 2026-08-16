"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { Libre_Baskerville } from "next/font/google";
import { cn } from "~/lib/utils";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Settings,
  Loader2,
} from "lucide-react";
import { getTargetLang, SOURCE_LANG } from "~/lib/languages";
import { ClickableIpa } from "~/components/clickable-ipa";
import { api } from "~/trpc/client";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";

const libreBaskerville = Libre_Baskerville({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

export type MultiLangResult = {
  targetLang: string;
  isCorrect: boolean;
  expected: string;
  ipa?: string | null;
  typo: boolean;
};

interface MultiReviewCardProps {
  entryId: string;
  mainText: string;
  type: "WORD" | "PROVERB";
  note?: string | null;
  languages: Array<{ targetLang: string; box: number }>;
  onSubmit: (answers: Array<{ targetLang: string; userAnswer: string }>) => void;
  onShowSolution?: () => void;
  onMarkAsWrong?: (targetLang: string) => void;
  onMarkAsCorrect?: (targetLang: string) => void;
  onExpectedUpdated?: (targetLang: string, text: string) => void;
  onNext?: () => void;
  isSubmitting: boolean;
  results?: MultiLangResult[] | null;
}

export function MultiReviewCard({
  entryId,
  mainText,
  type,
  note,
  languages,
  onSubmit,
  onShowSolution,
  onMarkAsWrong,
  onMarkAsCorrect,
  onExpectedUpdated,
  onNext,
  isSubmitting,
  results,
}: MultiReviewCardProps) {
  const t = useTranslations("review");
  const tCommon = useTranslations("common");
  const tCategories = useTranslations("categories");
  const tLang = useTranslations("languages");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [editingLang, setEditingLang] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const utils = api.useUtils();

  const updateTranslationMutation = api.entry.updateTranslationText.useMutation({
    onSuccess: (data) => {
      onExpectedUpdated?.(data.lang, data.text);
      setEditingLang(null);
      void utils.review.getDueMulti.invalidate();
      void utils.review.getDue.invalidate();
      toast({ title: tToasts("translationUpdated") });
    },
    onError: (error) => {
      const code = resolveErrorCode(error.message);
      toast({
        title: t("translationUpdateError"),
        description: code ? tErrors(code as "TRANSLATION_NOT_FOUND") : error.message,
        variant: "destructive",
      });
    },
  });

  const targetLangs = useMemo(
    () => languages.map((l) => l.targetLang),
    [languages],
  );
  const guidesQuery = api.pronunciation.getByPairs.useQuery(
    {
      nativeLang: SOURCE_LANG.code,
      targetLangs,
    },
    { enabled: Boolean(results) && targetLangs.length > 0 },
  );
  const itemsByLang = useMemo(() => {
    const map: Record<
      string,
      Array<{
        id: string;
        symbol: string;
        approx: string | null;
        explanation: string;
        exampleWord: string | null;
      }>
    > = {};
    for (const entry of guidesQuery.data?.guides ?? []) {
      map[entry.targetLang] = entry.guide?.items ?? [];
    }
    return map;
  }, [guidesQuery.data]);

  useEffect(() => {
    setAnswers({});
    setEditingLang(null);
    setEditText("");
  }, [mainText, entryId]);

  const startEdit = (targetLang: string, expected: string) => {
    setEditingLang(targetLang);
    setEditText(expected);
  };

  const cancelEdit = () => {
    setEditingLang(null);
    setEditText("");
  };

  const saveEdit = (targetLang: string) => {
    const text = editText.trim();
    if (!text) return;
    updateTranslationMutation.mutate({
      entryId,
      lang: targetLang,
      text,
    });
  };

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

  const typeLabel =
    type === "PROVERB"
      ? tCategories("entryTypeProverb")
      : tCategories("entryTypeWord");

  return (
    <Card className="cahier-card mx-auto w-full overflow-hidden">
      <CardContent className="space-y-6 px-6 py-10 sm:px-12 sm:py-14">
        <div className="text-center">
          <Badge variant="outline">{typeLabel}</Badge>
          <h2
            className={cn(
              "mt-4 text-4xl font-bold leading-tight text-[#1e3a5f] sm:text-5xl",
              libreBaskerville.className,
            )}
          >
            {mainText}
          </h2>
          {note ? (
            <p className="mt-3 text-sm text-muted-foreground">{note}</p>
          ) : null}
        </div>
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
                    className={`relative flex items-start gap-3 rounded-lg p-4 pr-12 ${
                      result.isCorrect
                        ? "bg-green-50 dark:bg-green-950"
                        : "bg-red-50 dark:bg-red-950"
                    }`}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2 h-7 w-7 text-muted-foreground"
                      onClick={() =>
                        startEdit(result.targetLang, result.expected)
                      }
                      aria-label={t("editTranslation")}
                      title={t("editTranslation")}
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </Button>
                    {result.isCorrect ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                    ) : (
                      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 pr-2">
                        <p className="flex items-center gap-2 font-semibold">
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
                        {!result.isCorrect && onMarkAsCorrect && (
                          <Button
                            onClick={() => onMarkAsCorrect(result.targetLang)}
                            variant="outline"
                            size="sm"
                            disabled={isSubmitting}
                          >
                            {t("markAsCorrect")}
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
                        <div className="text-sm">
                          <div className="flex items-start gap-2">
                            <span className="shrink-0 text-muted-foreground">
                              {t("expected")}
                            </span>
                            {editingLang === result.targetLang ? (
                              <div className="flex min-w-0 flex-1 flex-col gap-2">
                                <Input
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      saveEdit(result.targetLang);
                                    }
                                    if (e.key === "Escape") {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      cancelEdit();
                                    }
                                  }}
                                  disabled={updateTranslationMutation.isPending}
                                  autoFocus
                                  className="h-8 text-sm"
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => saveEdit(result.targetLang)}
                                    disabled={
                                      updateTranslationMutation.isPending ||
                                      !editText.trim()
                                    }
                                  >
                                    {updateTranslationMutation.isPending ? (
                                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                    ) : null}
                                    {tCommon("save")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={cancelEdit}
                                    disabled={updateTranslationMutation.isPending}
                                  >
                                    {tCommon("cancel")}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <span className="font-medium text-foreground">
                                {result.expected}
                              </span>
                            )}
                          </div>
                          {result.ipa && editingLang !== result.targetLang ? (
                            <div className="mt-1">
                              <ClickableIpa
                                ipa={result.ipa}
                                items={itemsByLang[result.targetLang] ?? []}
                                className="mt-0 text-base italic tracking-wide text-foreground/80"
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {result.typo && (
                        <div className="mt-2 flex items-center gap-1 text-sm text-yellow-600 dark:text-yellow-400">
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

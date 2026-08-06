"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { VocabChat } from "~/components/vocab-chat";
import { ClickableIpa } from "~/components/clickable-ipa";
import { api } from "~/trpc/client";
import { SOURCE_LANG } from "~/lib/languages";

interface ReviewCardProps {
  mainText: string;
  type: "WORD" | "PROVERB";
  note?: string | null;
  /** IPA of the target-language translation */
  ipa?: string | null;
  box: number;
  targetLang: string;
  onSubmit: (answer: string) => void;
  onShowSolution?: () => void;
  onMarkAsWrong?: () => void;
  onNext?: () => void;
  isSubmitting: boolean;
  result?: {
    isCorrect: boolean;
    expected: string;
    typo: boolean;
  } | null;
}

export function ReviewCard({
  mainText,
  type,
  note,
  ipa,
  box,
  targetLang,
  onSubmit,
  onShowSolution,
  onMarkAsWrong,
  onNext,
  isSubmitting,
  result,
}: ReviewCardProps) {
  const t = useTranslations("review");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("languages");
  const [answer, setAnswer] = useState("");

  const guideQuery = api.pronunciation.getByPair.useQuery(
    {
      nativeLang: SOURCE_LANG.code,
      targetLang,
    },
    { enabled: Boolean(result) },
  );
  const guideItems = guideQuery.data?.items ?? [];

  useEffect(() => {
    setAnswer("");
  }, [mainText]);

  const handleSubmit = () => {
    if (answer.trim()) {
      onSubmit(answer.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (!result) {
        handleSubmit();
      } else if (onNext) {
        onNext();
      }
    }
  };

  useEffect(() => {
    if (result && onNext) {
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
  }, [result, onNext]);

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="text-2xl">{mainText}</CardTitle>
            {result && ipa ? (
              <ClickableIpa
                ipa={ipa}
                items={guideItems}
                showFullListButton
                targetLangName={tLang(targetLang)}
              />
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <Badge variant="outline">{type}</Badge>
            <Badge variant="secondary">{tCommon("box", { number: box })}</Badge>
          </div>
        </div>
        {note && <p className="text-sm text-muted-foreground mt-2">{note}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        {!result ? (
          <>
            <div>
              <Input
                placeholder={t("answerPlaceholder")}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSubmitting}
                autoFocus
                className="text-lg"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !answer.trim()}
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
            <div
              className={`flex items-center gap-3 p-4 rounded-lg ${
                result.isCorrect
                  ? "bg-green-50 dark:bg-green-950"
                  : "bg-red-50 dark:bg-red-950"
              }`}
            >
              {result.isCorrect ? (
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              )}
              <div className="flex-1">
                <p className="font-semibold">
                  {result.isCorrect ? t("correct") : t("incorrect")}
                </p>
                <div className="mt-2 space-y-1">
                  <p className="text-sm">
                    <span className="text-muted-foreground">{t("yourAnswer")}</span>{" "}
                    <span
                      className={`font-medium ${
                        result.isCorrect
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {answer}
                    </span>
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">{t("expected")}</span>{" "}
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

            <div className="flex gap-2">
              {result.isCorrect && onMarkAsWrong && (
                <Button
                  onClick={onMarkAsWrong}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  {t("markAsWrong")}
                </Button>
              )}
              {onNext && (
                <Button
                  onClick={onNext}
                  size="sm"
                  className={
                    result.isCorrect && onMarkAsWrong ? "flex-1" : "w-full"
                  }
                >
                  {result.isCorrect ? t("nextCard") : t("continue")}
                </Button>
              )}
            </div>

            <p className="text-xs text-center text-muted-foreground">
              {t("enterToContinue")}
            </p>

            <VocabChat
              sourceWord={mainText}
              translation={result.expected}
              targetLang={targetLang}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

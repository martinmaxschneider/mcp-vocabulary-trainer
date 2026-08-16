"use client";

import { useState, useEffect } from "react";
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
import { VocabChat } from "~/components/vocab-chat";
import { ClickableIpa } from "~/components/clickable-ipa";
import { api } from "~/trpc/client";
import { SOURCE_LANG } from "~/lib/languages";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";

const libreBaskerville = Libre_Baskerville({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

interface ReviewCardProps {
  entryId: string;
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
  onMarkAsCorrect?: () => void;
  onExpectedUpdated?: (text: string) => void;
  onNext?: () => void;
  isSubmitting: boolean;
  result?: {
    isCorrect: boolean;
    expected: string;
    typo: boolean;
  } | null;
}

export function ReviewCard({
  entryId,
  mainText,
  type,
  note,
  ipa,
  box,
  targetLang,
  onSubmit,
  onShowSolution,
  onMarkAsWrong,
  onMarkAsCorrect,
  onExpectedUpdated,
  onNext,
  isSubmitting,
  result,
}: ReviewCardProps) {
  const t = useTranslations("review");
  const tCommon = useTranslations("common");
  const tCategories = useTranslations("categories");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const [answer, setAnswer] = useState("");
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const utils = api.useUtils();

  const guideQuery = api.pronunciation.getByPair.useQuery(
    {
      nativeLang: SOURCE_LANG.code,
      targetLang,
    },
    { enabled: Boolean(result) },
  );
  const guideItems = guideQuery.data?.items ?? [];

  const updateTranslationMutation = api.entry.updateTranslationText.useMutation({
    onSuccess: (data) => {
      onExpectedUpdated?.(data.text);
      setEditing(false);
      void utils.review.getDue.invalidate();
      void utils.review.getDueMulti.invalidate();
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

  useEffect(() => {
    setAnswer("");
    setEditing(false);
    setEditText("");
  }, [mainText, entryId]);

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

  const typeLabel =
    type === "PROVERB"
      ? tCategories("entryTypeProverb")
      : tCategories("entryTypeWord");

  return (
    <Card className="cahier-card mx-auto w-full overflow-hidden">
      <CardContent className="px-6 py-10 sm:px-12 sm:py-14">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Badge variant="outline">{typeLabel}</Badge>
          <Badge variant="secondary">{tCommon("box", { number: box })}</Badge>
        </div>
        <h2
          className={cn(
            "text-center text-4xl font-bold leading-tight text-[#1e3a5f] sm:text-5xl",
            libreBaskerville.className,
          )}
        >
          {mainText}
        </h2>
        {note ? (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            {note}
          </p>
        ) : null}
        {result && ipa ? (
          <div className="mt-3 flex justify-center">
            <ClickableIpa ipa={ipa} items={guideItems} />
          </div>
        ) : null}

        <div className="mx-auto mt-10 max-w-xl space-y-4">
        {!result ? (
          <>
            <Input
              placeholder={t("answerPlaceholder")}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting}
              autoFocus
              className="h-14 text-center text-xl"
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !answer.trim()}
                className="h-12 flex-1 bg-[#1e3a5f] text-white hover:bg-[#16304d]"
                size="lg"
              >
                {isSubmitting ? t("checking") : t("checkAnswer")}
              </Button>
              {onShowSolution && (
                <Button
                  onClick={onShowSolution}
                  disabled={isSubmitting}
                  variant="ghost"
                  size="lg"
                  className="h-12 text-[#1e3a5f]"
                >
                  {t("showSolution")}
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div
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
                onClick={() => {
                  setEditText(result.expected);
                  setEditing(true);
                }}
                aria-label={t("editTranslation")}
                title={t("editTranslation")}
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
              {result.isCorrect ? (
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              )}
              <div className="min-w-0 flex-1">
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
                  <div className="text-sm">
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 text-muted-foreground">
                        {t("expected")}
                      </span>
                      {editing ? (
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <Input
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                e.stopPropagation();
                                const text = editText.trim();
                                if (!text) return;
                                updateTranslationMutation.mutate({
                                  entryId,
                                  lang: targetLang,
                                  text,
                                });
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                e.stopPropagation();
                                setEditing(false);
                              }
                            }}
                            disabled={updateTranslationMutation.isPending}
                            autoFocus
                            className="h-8 text-sm"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => {
                                const text = editText.trim();
                                if (!text) return;
                                updateTranslationMutation.mutate({
                                  entryId,
                                  lang: targetLang,
                                  text,
                                });
                              }}
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
                              onClick={() => setEditing(false)}
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
              {!result.isCorrect && onMarkAsCorrect && (
                <Button
                  onClick={onMarkAsCorrect}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  {t("markAsCorrect")}
                </Button>
              )}
              {onNext && (
                <Button
                  onClick={onNext}
                  size="sm"
                  className={
                    (result.isCorrect && onMarkAsWrong) ||
                    (!result.isCorrect && onMarkAsCorrect)
                      ? "flex-1"
                      : "w-full"
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
        </div>
      </CardContent>
    </Card>
  );
}

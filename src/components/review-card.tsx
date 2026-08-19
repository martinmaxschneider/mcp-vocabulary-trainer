"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Settings, Loader2 } from "lucide-react";
import { VocabChat } from "~/components/vocab-chat";
import { ClickableIpa } from "~/components/clickable-ipa";
import { CahierQuizCard } from "~/components/cahier-quiz-view";
import { api } from "~/trpc/client";
import { SOURCE_LANG } from "~/lib/languages";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";

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
        description: code
          ? tErrors(code as "TRANSLATION_NOT_FOUND")
          : error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    setAnswer("");
    setEditing(false);
    setEditText("");
  }, [mainText, entryId]);

  const typeLabel =
    type === "PROVERB"
      ? tCategories("entryTypeProverb")
      : tCategories("entryTypeWord");

  const saveExpected = () => {
    const text = editText.trim();
    if (!text) return;
    updateTranslationMutation.mutate({
      entryId,
      lang: targetLang,
      text,
    });
  };

  return (
    <CahierQuizCard
      cardKey={entryId}
      badges={[
        { label: typeLabel },
        { label: tCommon("box", { number: box }), variant: "secondary" },
      ]}
      prompt={mainText}
      subtitle={
        note || (result && ipa) ? (
          <>
            {note ? <p className="text-muted-foreground">{note}</p> : null}
            {result && ipa ? (
              <div className="mt-3 flex justify-center">
                <ClickableIpa ipa={ipa} items={guideItems} />
              </div>
            ) : null}
          </>
        ) : null
      }
      mode="typed"
      typedValue={answer}
      onTypedChange={setAnswer}
      onTypedSubmit={() => {
        if (answer.trim()) onSubmit(answer.trim());
      }}
      onShowSolution={onShowSolution}
      typedResult={
        result
          ? {
              isCorrect: result.isCorrect,
              expected: result.expected,
              typo: result.typo,
              yourAnswer: answer,
            }
          : null
      }
      onTypedNext={onNext}
      pending={isSubmitting}
      expectedAction={
        result ? (
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
        ) : null
      }
      resultExtra={
        result ? (
          <div className="space-y-4">
            {editing ? (
              <div className="flex flex-col gap-2">
                <Input
                  value={editText}
                  onChange={(event) => setEditText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.stopPropagation();
                      saveExpected();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
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
                    onClick={saveExpected}
                    disabled={
                      updateTranslationMutation.isPending || !editText.trim()
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
            ) : null}
            <div className="flex gap-2">
              {result.isCorrect && onMarkAsWrong ? (
                <Button
                  onClick={onMarkAsWrong}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  {t("markAsWrong")}
                </Button>
              ) : null}
              {!result.isCorrect && onMarkAsCorrect ? (
                <Button
                  onClick={onMarkAsCorrect}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  {t("markAsCorrect")}
                </Button>
              ) : null}
            </div>
            <VocabChat
              sourceWord={mainText}
              translation={result.expected}
              targetLang={targetLang}
            />
          </div>
        ) : null
      }
    />
  );
}

"use client";

import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { QuestionInput } from "~/components/worksheets/question-input";
import type { WorksheetUserAnswer } from "~/lib/schemas/worksheet";
import type { RouterOutputs } from "~/trpc/client";
import {
  formatAcceptedAnswer,
  isDraftComplete,
} from "~/lib/worksheet-display";
import { cn } from "~/lib/utils";

type PlayerQuestion = RouterOutputs["worksheet"]["playerGet"]["questions"][number];

type Props = {
  question: PlayerQuestion;
  targetLang: string;
  draft: WorksheetUserAnswer | undefined;
  onDraftChange: (value: WorksheetUserAnswer) => void;
  onCheck: () => void;
  onOverride: (isCorrect: boolean) => void;
  checking?: boolean;
  marking?: boolean;
  serifClassName: string;
};

export function QuestionCard({
  question,
  targetLang,
  draft,
  onDraftChange,
  onCheck,
  onOverride,
  checking,
  marking,
  serifClassName,
}: Props) {
  const t = useTranslations("worksheets");
  const answered = Boolean(question.answer);
  const isCorrect = question.answer?.isCorrect ?? false;
  const override = question.answer?.manualOverride ?? null;
  const canCheck = !answered && isDraftComplete(question.type, question.payload, draft);
  const solution = formatAcceptedAnswer({
    type: question.type,
    payload: question.payload,
    accepted: question.accepted,
    trueLabel: t("trueLabel"),
    falseLabel: t("falseLabel"),
  });

  const resultLabel = isCorrect
    ? override === true
      ? t("markedCorrect")
      : question.answer?.isTypo
        ? t("correctWithTypo")
        : t("correct")
    : override === false
      ? t("markedIncorrect")
      : t("incorrect");

  return (
    <article className="rounded-2xl bg-white p-6 shadow-[0_10px_30px_rgba(30,58,95,0.08)] sm:p-8">
      {question.categoryLabel ? (
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-600">
          {question.categoryLabel}
        </p>
      ) : null}
      <h2 className={cn("text-2xl font-bold leading-snug text-[#1e3a5f]", serifClassName)}>
        {question.prompt}
      </h2>
      {question.hint ? (
        <p className="mt-2 text-sm italic text-slate-500">{question.hint}</p>
      ) : null}

      <div className="mt-6">
        <QuestionInput
          type={question.type}
          payload={question.payload}
          targetLang={targetLang}
          value={draft}
          onChange={onDraftChange}
          disabled={answered}
        />
      </div>

      {answered ? (
        <div
          className={cn(
            "mt-6 rounded-lg border px-4 py-3 text-sm",
            isCorrect
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800",
          )}
        >
          <p className="font-medium">{resultLabel}</p>
          {solution ? (
            <p className="mt-1">
              {t("solution")}: {solution}
            </p>
          ) : null}
          {question.explanation ? (
            <p className="mt-1 text-[13px] opacity-80">{question.explanation}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {!answered ? (
          <Button
            type="button"
            onClick={onCheck}
            disabled={!canCheck || checking}
            className="bg-[#1e3a5f] text-white hover:bg-[#16304d]"
          >
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("checkAnswer")}
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOverride(!isCorrect)}
            disabled={marking}
            className={
              isCorrect
                ? "h-8 px-2 text-xs font-normal text-slate-400 hover:bg-transparent hover:text-red-700"
                : "h-8 px-2 text-xs font-normal text-slate-400 hover:bg-transparent hover:text-emerald-700"
            }
          >
            {marking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isCorrect ? t("markIncorrect") : t("markCorrect")}
          </Button>
        )}
      </div>
    </article>
  );
}

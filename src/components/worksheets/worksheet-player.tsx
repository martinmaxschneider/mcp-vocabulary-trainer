"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { Progress } from "~/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { QuestionCard } from "~/components/worksheets/question-card";
import { WorksheetResults } from "~/components/worksheets/worksheet-results";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";
import type { WorksheetUserAnswer } from "~/lib/schemas/worksheet";
import { emptyDraft, isDraftComplete } from "~/lib/worksheet-display";
import { cn } from "~/lib/utils";
import { useCelebrate } from "~/components/gamification-provider";

type Mode = "sequential" | "sheet";

type Props = {
  id: string;
  cursiveClassName: string;
  serifClassName: string;
};

export function WorksheetPlayer({ id, cursiveClassName, serifClassName }: Props) {
  const t = useTranslations("worksheets");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("languages");
  const tToasts = useTranslations("toasts");
  const tErrorCodes = useTranslations("errors.codes");
  const router = useRouter();
  const { toast } = useToast();
  const celebrate = useCelebrate();
  const utils = api.useUtils();

  const query = api.worksheet.playerGet.useQuery({ id });
  const [mode, setMode] = useState<Mode>("sequential");
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, WorksheetUserAnswer>>({});
  const [showResults, setShowResults] = useState(false);

  const worksheet = query.data;

  useEffect(() => {
    if (!query.data) return;
    const firstUnanswered = query.data.questions.findIndex((q) => !q.answer);
    setIndex(firstUnanswered === -1 ? 0 : firstUnanswered);
    if (query.data.status === "COMPLETED") {
      setShowResults(true);
    }
  }, [query.data?.id]);

  const current = worksheet?.questions[index];
  const targetLang = worksheet?.targetLang ?? "fr";
  const cahierKey = (
    ["de", "en", "es", "fr", "pt", "gsw"] as const
  ).includes(targetLang as "fr")
    ? (`cahierLabel.${targetLang}` as "cahierLabel.fr")
    : "cahierLabel.fallback";
  const cahierLabel =
    cahierKey === "cahierLabel.fallback"
      ? t("cahierLabel.fallback", {
          language: worksheet ? tLang(worksheet.targetLang) : "",
        })
      : t(cahierKey);

  const submitMutation = api.worksheet.submitAnswer.useMutation({
    onSuccess: async (data) => {
      celebrate(data.gamification);
      await utils.worksheet.playerGet.invalidate({ id });
      await utils.worksheet.list.invalidate();
      if (data.status === "COMPLETED") {
        setShowResults(true);
      }
    },
    onError: (err) => {
      const code = resolveErrorCode(err.message);
      toast({
        title: tToasts("worksheetSubmitError"),
        description: code ? tErrorCodes(code as "NOT_FOUND") : err.message,
        variant: "destructive",
      });
    },
  });

  const submitManyMutation = api.worksheet.submitAnswers.useMutation({
    onSuccess: async (data) => {
      celebrate(data.gamification);
      await utils.worksheet.playerGet.invalidate({ id });
      await utils.worksheet.list.invalidate();
      if (data.status === "COMPLETED") {
        setShowResults(true);
      }
    },
    onError: (err) => {
      const code = resolveErrorCode(err.message);
      toast({
        title: tToasts("worksheetSubmitError"),
        description: code ? tErrorCodes(code as "NOT_FOUND") : err.message,
        variant: "destructive",
      });
    },
  });

  const markMutation = api.worksheet.overrideGrade.useMutation({
    onSuccess: async (_data, variables) => {
      await utils.worksheet.playerGet.invalidate({ id });
      await utils.worksheet.list.invalidate();
      toast({
        title: variables.isCorrect
          ? tToasts("worksheetMarkedCorrect")
          : tToasts("worksheetMarkedIncorrect"),
      });
    },
    onError: (err) => {
      const code = resolveErrorCode(err.message);
      toast({
        title: tToasts("worksheetMarkError"),
        description: code ? tErrorCodes(code as "NOT_FOUND") : err.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = api.worksheet.delete.useMutation({
    onSuccess: async () => {
      toast({ title: tToasts("worksheetDeleted") });
      await utils.worksheet.list.invalidate();
      router.push("/worksheets");
    },
    onError: (err) => {
      const code = resolveErrorCode(err.message);
      toast({
        title: tToasts("worksheetDeleteError"),
        description: code ? tErrorCodes(code as "NOT_FOUND") : err.message,
        variant: "destructive",
      });
    },
  });

  const pendingAnswers = useMemo(() => {
    if (!worksheet) return [];
    return worksheet.questions
      .filter((q) => !q.answer)
      .map((q) => {
        const draft = drafts[q.id];
        return { question: q, draft };
      })
      .filter(
        (item): item is { question: typeof item.question; draft: WorksheetUserAnswer } =>
          Boolean(item.draft) &&
          isDraftComplete(item.question.type, item.question.payload, item.draft),
      )
      .map(({ question, draft }) => ({
        questionId: question.id,
        userAnswer: draft,
      }));
  }, [worksheet, drafts]);

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("loading")}
      </div>
    );
  }

  if (query.isError || !worksheet) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link href="/worksheets">
            <ArrowLeft className="h-4 w-4" />
            {tCommon("back")}
          </Link>
        </Button>
        <p className="text-muted-foreground">{tCommon("notFound")}</p>
      </div>
    );
  }

  const progressValue =
    worksheet.questionCount === 0
      ? 0
      : (worksheet.answeredCount / worksheet.questionCount) * 100;

  function checkQuestion(questionId: string) {
    const question = worksheet!.questions.find((q) => q.id === questionId);
    if (!question) return;
    const draft = drafts[questionId] ?? emptyDraft(question.type, question.payload);
    if (!isDraftComplete(question.type, question.payload, draft)) return;
    submitMutation.mutate({ questionId, userAnswer: draft });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2 text-[#1e3a5f]">
              <Link href="/worksheets">
                <ArrowLeft className="h-4 w-4" />
                {tCommon("back")}
              </Link>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-red-700"
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  {tCommon("delete")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("deleteConfirmDesc", { title: worksheet.title })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate({ id: worksheet.id })}
                  >
                    {tCommon("delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <header className="space-y-3">
            <p className={cn("text-lg text-red-600", cursiveClassName)}>
              {cahierLabel}
            </p>
            <h1 className={cn("text-4xl font-bold text-[#1e3a5f]", serifClassName)}>
              {worksheet.title}
            </h1>
            {worksheet.description ? (
              <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
                {worksheet.description}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="rounded-md bg-slate-200/80 px-2.5 py-1 text-xs text-slate-700">
                {t("questionCount", { count: worksheet.questionCount })}
              </span>
              <span className="rounded-md bg-slate-200/80 px-2.5 py-1 text-xs text-slate-700">
                {t("notation", { max: worksheet.max })}
              </span>
              <span className="rounded-md bg-slate-200/80 px-2.5 py-1 text-xs text-slate-700">
                {tLang(worksheet.targetLang)}
              </span>
            </div>
          </header>

          <div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setMode("sequential")}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm",
                mode === "sequential" ? "bg-[#1e3a5f] text-white" : "text-slate-600",
              )}
            >
              {t("modeSequential")}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("sheet");
                setShowResults(false);
              }}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm",
                mode === "sheet" ? "bg-[#1e3a5f] text-white" : "text-slate-600",
              )}
            >
              {t("modeSheet")}
            </button>
          </div>

          {showResults && mode === "sequential" ? (
            <WorksheetResults
              worksheet={worksheet}
              serifClassName={serifClassName}
              onReview={
                worksheet.status === "COMPLETED"
                  ? () => {
                      setShowResults(false);
                      setMode("sheet");
                    }
                  : undefined
              }
            />
          ) : null}

          {!showResults || mode === "sheet" ? (
            <>
              <div className="flex items-center gap-4 text-sm text-[#1e3a5f]">
                <span className="font-medium">
                  {mode === "sequential"
                    ? t("progressQuestion", {
                        current: index + 1,
                        total: worksheet.questionCount,
                      })
                    : t("progressSheet", { total: worksheet.questionCount })}
                </span>
                <Progress value={progressValue} className="h-1.5 flex-1 bg-slate-200" />
                <span className="whitespace-nowrap text-slate-500">
                  {t("correctSoFar", { count: worksheet.correctCount })}
                </span>
              </div>

              {mode === "sequential" && current ? (
                <div className="space-y-4">
                  <QuestionCard
                    question={current}
                    targetLang={worksheet.targetLang}
                    draft={
                      drafts[current.id] ??
                      (current.type === "TRUE_FALSE"
                        ? undefined
                        : emptyDraft(current.type, current.payload))
                    }
                    onDraftChange={(value) =>
                      setDrafts((prev) => ({ ...prev, [current.id]: value }))
                    }
                    onCheck={() => checkQuestion(current.id)}
                    onOverride={(isCorrect) =>
                      markMutation.mutate({ questionId: current.id, isCorrect })
                    }
                    checking={submitMutation.isPending}
                    marking={markMutation.isPending}
                    serifClassName={serifClassName}
                  />
                  {current.answer && index < worksheet.questions.length - 1 ? (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={() => setIndex((value) => value + 1)}
                        className="bg-[#1e3a5f] text-white hover:bg-[#16304d]"
                      >
                        {t("next")}
                      </Button>
                    </div>
                  ) : null}
                  {current.answer &&
                  index === worksheet.questions.length - 1 &&
                  worksheet.status === "COMPLETED" ? (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={() => setShowResults(true)}
                        className="bg-[#1e3a5f] text-white hover:bg-[#16304d]"
                      >
                        {t("showResults")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {mode === "sheet" ? (
                <div className="space-y-6">
                  {worksheet.status === "COMPLETED" ? (
                    <WorksheetResults
                      worksheet={worksheet}
                      serifClassName={serifClassName}
                    />
                  ) : null}
                  {worksheet.questions.map((question) => (
                    <QuestionCard
                      key={question.id}
                      question={question}
                      targetLang={worksheet.targetLang}
                      draft={
                        drafts[question.id] ??
                        (question.type === "TRUE_FALSE"
                          ? undefined
                          : emptyDraft(question.type, question.payload))
                      }
                      onDraftChange={(value) =>
                        setDrafts((prev) => ({ ...prev, [question.id]: value }))
                      }
                      onCheck={() => checkQuestion(question.id)}
                      onOverride={(isCorrect) =>
                        markMutation.mutate({ questionId: question.id, isCorrect })
                      }
                      checking={
                        submitMutation.isPending &&
                        submitMutation.variables?.questionId === question.id
                      }
                      marking={
                        markMutation.isPending &&
                        markMutation.variables?.questionId === question.id
                      }
                      serifClassName={serifClassName}
                    />
                  ))}
                  {pendingAnswers.length > 0 ? (
                    <Button
                      type="button"
                      onClick={() =>
                        submitManyMutation.mutate({
                          worksheetId: worksheet.id,
                          answers: pendingAnswers,
                        })
                      }
                      disabled={submitManyMutation.isPending}
                      className="bg-[#1e3a5f] text-white hover:bg-[#16304d]"
                    >
                      {submitManyMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      {t("submitRemaining", { count: pendingAnswers.length })}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
    </div>
  );
}

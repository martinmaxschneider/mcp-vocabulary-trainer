"use client";

import { useEffect } from "react";
import { Caveat, Libre_Baskerville } from "next/font/google";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  Loader2,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { SatzAudioButton } from "~/components/satz-audio-button";
import {
  ReviewBoxBar,
  type SessionBoxCounts,
} from "~/components/review-box-bar";
import { cn } from "~/lib/utils";

const caveat = Caveat({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
});

const libreBaskerville = Libre_Baskerville({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

const NAVY_BTN = "h-12 bg-[#1e3a5f] text-white hover:bg-[#16304d]";

export type QuizAudio = {
  urls: string[];
  langCode?: string;
  label: string;
};

export type QuizBadge = {
  label: string;
  variant?: "secondary" | "outline";
};

export type QuizTypedResult = {
  isCorrect: boolean;
  expected: string;
  typo?: boolean;
  yourAnswer?: string;
};

export type QuizParadigmSlot = {
  key: string;
  label: string;
  tenseKey?: string;
  tenseLabel?: string;
  personIndex: number;
};

export type CahierQuizFrameProps = {
  kicker: string;
  cardsLeft?: number | null;
  langPill: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  remainingBoxes?: SessionBoxCounts | null;
  chromeExtra?: React.ReactNode;
  children: React.ReactNode;
};

export type CahierQuizCardProps = {
  cardKey?: string | number;
  badges?: QuizBadge[];
  prompt: string;
  subtitle?: React.ReactNode;
  promptAudio?: QuizAudio | null;
  answer?: string | null;
  answerAudio?: QuizAudio | null;
  answerExtra?: React.ReactNode;
  resultExtra?: React.ReactNode;
  expectedAction?: React.ReactNode;
  pending?: boolean;
} & (
  | {
      mode: "selfGrade";
      revealed: boolean;
      onReveal: () => void;
      onKnew: () => void;
      onDidNotKnow: () => void;
    }
  | {
      mode: "typed";
      typedValue: string;
      onTypedChange: (value: string) => void;
      onTypedSubmit: () => void;
      onShowSolution?: () => void;
      typedPlaceholder?: string;
      typedCheckLabel?: string;
      typedResult?: QuizTypedResult | null;
      onTypedNext?: () => void;
      typedNextLabel?: string;
    }
  | {
      mode: "paradigm";
      paradigmSlots: QuizParadigmSlot[];
      paradigmValues: Record<string, string>;
      onParadigmChange: (key: string, value: string) => void;
      onParadigmSubmit: () => void;
      paradigmResults?: Record<
        string,
        { isCorrect: boolean; expected: string }
      > | null;
      onParadigmNext?: () => void;
      paradigmNextLabel?: string;
      paradigmCheckLabel?: string;
      paradigmPlaceholder?: string;
      paradigmScore?: React.ReactNode;
    }
);

export type CahierQuizViewProps = Omit<CahierQuizFrameProps, "children"> &
  CahierQuizCardProps;

export function CahierQuizFrame({
  kicker,
  cardsLeft = null,
  langPill,
  onBack,
  backLabel,
  remainingBoxes,
  chromeExtra,
  children,
}: CahierQuizFrameProps) {
  const tReview = useTranslations("review");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        {onBack ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-[#1e3a5f] hover:bg-white/70 hover:text-[#1e3a5f]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {backLabel ?? tReview("backToSetup")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {cardsLeft != null ? (
            <span className="text-sm font-medium text-[#1e3a5f]">
              {cardsLeft === 0
                ? tReview("lastCard")
                : tReview("cardsLeft", { count: cardsLeft })}
            </span>
          ) : null}
          <span className="rounded-md bg-slate-200/80 px-2.5 py-1 text-xs text-slate-700">
            {langPill}
          </span>
          {chromeExtra}
        </div>
      </div>

      <p
        className={cn("mb-3 text-center text-base text-red-600", caveat.className)}
      >
        {kicker}
      </p>
      {remainingBoxes ? (
        <div className="mb-6">
          <ReviewBoxBar remaining={remainingBoxes} />
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function CahierQuizCard(props: CahierQuizCardProps) {
  const t = useTranslations("sentences");
  const tReview = useTranslations("review");
  const tConj = useTranslations("conjugations");

  return (
    <Card key={props.cardKey} className="cahier-card overflow-hidden">
      <CardContent className="px-6 py-10 sm:px-12 sm:py-14">
        {props.badges && props.badges.length > 0 ? (
          <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
            {props.badges.map((badge) => (
              <Badge
                key={`${badge.variant ?? "outline"}-${badge.label}`}
                variant={badge.variant ?? "outline"}
              >
                {badge.label}
              </Badge>
            ))}
          </div>
        ) : null}

        {props.subtitle ? (
          <div className="mb-3 text-center text-sm text-slate-500">
            {props.subtitle}
          </div>
        ) : null}

        <h2
          className={cn(
            "text-center text-4xl font-bold leading-tight text-[#1e3a5f] sm:text-5xl",
            libreBaskerville.className,
          )}
        >
          {props.prompt}
        </h2>

        {props.promptAudio && props.promptAudio.urls.length > 0 ? (
          <div className="mt-4 flex justify-center">
            <SatzAudioButton
              urls={props.promptAudio.urls}
              langCode={props.promptAudio.langCode}
              label={props.promptAudio.label}
            />
          </div>
        ) : null}

        {props.mode === "selfGrade" && props.revealed && props.answer ? (
          <div className="mx-auto mt-10 max-w-xl space-y-4 border-t border-[#1e3a5f]/10 pt-8">
            <p
              className={cn(
                "text-center text-3xl font-semibold leading-tight text-[#1e3a5f] sm:text-4xl",
                libreBaskerville.className,
              )}
            >
              {props.answer}
            </p>
            {props.answerExtra}
            {props.answerAudio && props.answerAudio.urls.length > 0 ? (
              <div className="flex justify-center">
                <SatzAudioButton
                  urls={props.answerAudio.urls}
                  langCode={props.answerAudio.langCode}
                  label={props.answerAudio.label}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {props.mode === "selfGrade" ? (
          <div className="mx-auto mt-10 max-w-xl space-y-3">
            {!props.revealed ? (
              <Button
                type="button"
                size="lg"
                className={cn(NAVY_BTN, "w-full")}
                onClick={props.onReveal}
              >
                <Eye className="mr-2 h-4 w-4" />
                {t("reviewShowAnswer")}
              </Button>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  size="lg"
                  className={NAVY_BTN}
                  disabled={props.pending}
                  onClick={props.onKnew}
                >
                  {props.pending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ThumbsUp className="mr-2 h-4 w-4" />
                  )}
                  {t("reviewKnew")}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="h-12 border-[#1e3a5f]/20 text-[#1e3a5f]"
                  disabled={props.pending}
                  onClick={props.onDidNotKnow}
                >
                  <ThumbsDown className="mr-2 h-4 w-4" />
                  {t("reviewDidNotKnow")}
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {props.mode === "typed" ? (
          <TypedActions
            value={props.typedValue}
            onChange={props.onTypedChange}
            onSubmit={props.onTypedSubmit}
            onShowSolution={props.onShowSolution}
            placeholder={props.typedPlaceholder ?? tReview("answerPlaceholder")}
            checkLabel={props.typedCheckLabel ?? tReview("checkAnswer")}
            result={props.typedResult}
            onNext={props.onTypedNext}
            nextLabel={props.typedNextLabel}
            pending={props.pending}
            expectedAction={props.expectedAction}
            resultExtra={props.resultExtra}
          />
        ) : null}

        {props.mode === "paradigm" ? (
          <ParadigmActions
            slots={props.paradigmSlots}
            values={props.paradigmValues}
            onChange={props.onParadigmChange}
            onSubmit={props.onParadigmSubmit}
            results={props.paradigmResults}
            onNext={props.onParadigmNext}
            nextLabel={props.paradigmNextLabel ?? tConj("nextVerb")}
            checkLabel={props.paradigmCheckLabel ?? tConj("checkParadigm")}
            placeholder={props.paradigmPlaceholder ?? tConj("formPlaceholder")}
            score={props.paradigmScore}
            pending={props.pending}
            resultExtra={props.resultExtra}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

export function CahierQuizView(props: CahierQuizViewProps) {
  const { kicker, cardsLeft, langPill, onBack, backLabel, remainingBoxes, chromeExtra, ...card } =
    props;
  return (
    <CahierQuizFrame
      kicker={kicker}
      cardsLeft={cardsLeft}
      langPill={langPill}
      onBack={onBack}
      backLabel={backLabel}
      remainingBoxes={remainingBoxes}
      chromeExtra={chromeExtra}
    >
      <CahierQuizCard {...card} />
    </CahierQuizFrame>
  );
}

function TypedActions({
  value,
  onChange,
  onSubmit,
  onShowSolution,
  placeholder,
  checkLabel,
  result,
  onNext,
  nextLabel,
  pending,
  expectedAction,
  resultExtra,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onShowSolution?: () => void;
  placeholder: string;
  checkLabel: string;
  result?: QuizTypedResult | null;
  onNext?: () => void;
  nextLabel?: string;
  pending?: boolean;
  expectedAction?: React.ReactNode;
  resultExtra?: React.ReactNode;
}) {
  const tReview = useTranslations("review");

  useEffect(() => {
    if (!result || !onNext) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (event.key !== "Enter") return;
      event.preventDefault();
      onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, onNext]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter") return;
    if (!result) {
      if (value.trim()) onSubmit();
      return;
    }
    onNext?.();
  };

  return (
    <div className="mx-auto mt-10 max-w-xl space-y-4">
      {!result ? (
        <>
          <Input
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={pending}
            autoFocus
            className="h-14 text-center text-xl"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              size="lg"
              className={cn(NAVY_BTN, "flex-1")}
              disabled={pending || !value.trim()}
              onClick={onSubmit}
            >
              {pending ? tReview("checking") : checkLabel}
            </Button>
            {onShowSolution ? (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="h-12 text-[#1e3a5f]"
                disabled={pending}
                onClick={onShowSolution}
              >
                {tReview("showSolution")}
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div
            className={cn(
              "relative flex items-start gap-3 rounded-lg p-4",
              result.isCorrect
                ? "bg-green-50 dark:bg-green-950"
                : "bg-red-50 dark:bg-red-950",
              expectedAction ? "pr-12" : "",
            )}
          >
            {expectedAction}
            {result.isCorrect ? (
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-green-600 dark:text-green-400" />
            ) : (
              <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-red-600 dark:text-red-400" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {result.isCorrect ? tReview("correct") : tReview("incorrect")}
              </p>
              {result.yourAnswer != null && result.yourAnswer !== "" ? (
                <p className="mt-2 text-sm">
                  <span className="text-muted-foreground">
                    {tReview("yourAnswer")}
                  </span>{" "}
                  <span
                    className={cn(
                      "font-medium",
                      result.isCorrect
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400",
                    )}
                  >
                    {result.yourAnswer}
                  </span>
                </p>
              ) : null}
              <p className="mt-1 text-sm">
                <span className="text-muted-foreground">{tReview("expected")}</span>{" "}
                <span className="font-medium">{result.expected}</span>
              </p>
              {result.typo ? (
                <div className="mt-2 flex items-center gap-1 text-sm text-yellow-600 dark:text-yellow-400">
                  <AlertCircle className="h-4 w-4" />
                  <span>{tReview("typoNote")}</span>
                </div>
              ) : null}
            </div>
          </div>
          {onNext ? (
            <Button
              type="button"
              size="lg"
              className={cn(NAVY_BTN, "w-full")}
              onClick={onNext}
            >
              {nextLabel ??
                (result.isCorrect ? tReview("nextCard") : tReview("continue"))}
            </Button>
          ) : null}
          {onNext ? (
            <p className="text-center text-xs text-muted-foreground">
              {tReview("enterToContinue")}
            </p>
          ) : null}
          {resultExtra}
        </div>
      )}
    </div>
  );
}

function ParadigmActions({
  slots,
  values,
  onChange,
  onSubmit,
  results,
  onNext,
  nextLabel,
  checkLabel,
  placeholder,
  score,
  pending,
  resultExtra,
}: {
  slots: QuizParadigmSlot[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onSubmit: () => void;
  results?: Record<string, { isCorrect: boolean; expected: string }> | null;
  onNext?: () => void;
  nextLabel: string;
  checkLabel: string;
  placeholder: string;
  score?: React.ReactNode;
  pending?: boolean;
  resultExtra?: React.ReactNode;
}) {
  const tConj = useTranslations("conjugations");
  const filled = slots.some((slot) => (values[slot.key] ?? "").trim().length > 0);
  const groups = groupSlotsByTense(slots);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!results) onSubmit();
      }}
      className="mx-auto mt-10 max-w-2xl space-y-8"
    >
      {groups.map((group) => {
        const singular = group.slots.filter((slot) => slot.personIndex < 3);
        const plural = group.slots.filter((slot) => slot.personIndex >= 3);
        const columns =
          singular.length > 0 && plural.length > 0
            ? [singular, plural]
            : [group.slots];
        return (
          <div key={group.tenseKey} className="space-y-4">
            {groups.length > 1 && group.tenseLabel ? (
              <h3 className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {group.tenseLabel}
              </h3>
            ) : null}
            <div
              className={cn(
                "grid gap-x-10 gap-y-3",
                columns.length > 1 && "sm:grid-cols-2",
              )}
            >
              {columns.map((column, colIdx) => (
                <div key={colIdx} className="space-y-3">
                  {column.map((slot) => {
                    const slotResult = results?.[slot.key];
                    return (
                      <div key={slot.key} className="space-y-1">
                        <div className="flex items-center gap-3">
                          <Label
                            htmlFor={`slot-${slot.key}`}
                            className="w-20 shrink-0 text-sm text-[#1e3a5f]"
                          >
                            {slot.label}
                          </Label>
                          <Input
                            id={`slot-${slot.key}`}
                            value={values[slot.key] ?? ""}
                            onChange={(event) =>
                              onChange(slot.key, event.target.value)
                            }
                            placeholder={placeholder}
                            disabled={!!results || pending}
                            className={cn(
                              "h-12 text-base",
                              slotResult?.isCorrect && "border-green-500/60",
                              slotResult &&
                                !slotResult.isCorrect &&
                                "border-red-500/60",
                            )}
                          />
                          {slotResult ? (
                            slotResult.isCorrect ? (
                              <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                            ) : (
                              <XCircle className="h-5 w-5 shrink-0 text-red-600" />
                            )
                          ) : null}
                        </div>
                        {slotResult && !slotResult.isCorrect ? (
                          <p className="pl-[5.75rem] text-xs text-slate-500">
                            {tConj("expectedLabel")}{" "}
                            <span className="font-medium text-[#1e3a5f]">
                              {slotResult.expected}
                            </span>
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {!results ? (
        <Button
          type="submit"
          size="lg"
          className={cn(NAVY_BTN, "w-full")}
          disabled={!filled || pending}
        >
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {checkLabel}
        </Button>
      ) : (
        <div className="space-y-4">
          {score}
          {onNext ? (
            <Button
              type="button"
              size="lg"
              className={cn(NAVY_BTN, "w-full")}
              onClick={onNext}
            >
              {nextLabel}
            </Button>
          ) : null}
          {resultExtra}
        </div>
      )}
    </form>
  );
}

function groupSlotsByTense(slots: QuizParadigmSlot[]) {
  const groups: Array<{
    tenseKey: string;
    tenseLabel?: string;
    slots: QuizParadigmSlot[];
  }> = [];
  for (const slot of slots) {
    const tenseKey = slot.tenseKey ?? "_";
    const existing = groups.find((group) => group.tenseKey === tenseKey);
    if (existing) {
      existing.slots.push(slot);
    } else {
      groups.push({
        tenseKey,
        tenseLabel: slot.tenseLabel,
        slots: [slot],
      });
    }
  }
  return groups;
}

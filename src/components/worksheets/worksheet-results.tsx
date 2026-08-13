"use client";

import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import type { RouterOutputs } from "~/trpc/client";
import { cn } from "~/lib/utils";

type Results = RouterOutputs["worksheet"]["playerGet"];

type Props = {
  worksheet: Pick<
    Results,
    "title" | "score" | "max" | "correctCount" | "questionCount" | "analysis"
  >;
  serifClassName: string;
  onReview?: () => void;
};

export function WorksheetResults({ worksheet, serifClassName, onReview }: Props) {
  const t = useTranslations("worksheets");
  const weakTags = Object.entries(worksheet.analysis.byTag)
    .filter(([, stats]) => stats.wrong > 0)
    .sort((a, b) => b[1].wrong - a[1].wrong);

  return (
    <section className="cahier-card p-6 sm:p-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-600">
        {t("resultsEyebrow")}
      </p>
      <h2 className={cn("mt-2 text-3xl font-bold text-foreground", serifClassName)}>
        {t("score", { score: worksheet.score, max: worksheet.max })}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("correctCount", {
          correct: worksheet.correctCount,
          total: worksheet.questionCount,
        })}
      </p>

      {weakTags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {weakTags.map(([tag, stats]) => (
            <span
              key={tag}
              className="rounded-full bg-red-50 px-3 py-1 text-xs text-red-800"
            >
              {tag} ({stats.wrong}/{stats.total})
            </span>
          ))}
        </div>
      ) : null}

      {worksheet.analysis.weakGrammarTopics.length > 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("weakTopics")}:{" "}
          {worksheet.analysis.weakGrammarTopics.map((topic) => topic.title).join(", ")}
        </p>
      ) : null}

      {onReview ? (
        <div className="mt-6 flex justify-end">
          <Button
            type="button"
            onClick={onReview}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {t("reviewQuestions")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

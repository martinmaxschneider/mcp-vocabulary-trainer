"use client";

import { useTranslations } from "next-intl";
import { CheckCircle, Flame, Sparkles } from "lucide-react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export function SessionSummary({
  answers,
  correct,
  xp,
  streak,
  perfect,
  onDone,
}: {
  answers: number;
  correct: number;
  xp: number;
  streak: number;
  perfect: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("gamification");
  const tCommon = useTranslations("common");

  return (
    <div className="cahier-card py-16 text-center">
      {perfect ? (
        <Sparkles className="mx-auto mb-4 h-12 w-12 text-orange-500" />
      ) : (
        <CheckCircle className="mx-auto mb-4 h-12 w-12 text-emerald-600" />
      )}
      <h2 className="mb-2 text-2xl font-bold">
        {perfect ? t("perfectSessionTitle") : t("sessionDoneTitle")}
      </h2>
      <p className="mb-6 text-muted-foreground">
        {perfect ? t("perfectSessionDesc") : t("sessionDoneDesc")}
      </p>
      <div className="mx-auto mb-8 grid max-w-md grid-cols-3 gap-3">
        <div className="rounded-md border p-3">
          <div className="text-xl font-semibold tabular-nums">{xp}</div>
          <div className="text-xs text-muted-foreground">{t("xpEarned")}</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xl font-semibold tabular-nums">
            {correct}/{answers}
          </div>
          <div className="text-xs text-muted-foreground">{t("answersLabel")}</div>
        </div>
        <div className="rounded-md border p-3">
          <div
            className={cn(
              "inline-flex items-center justify-center gap-1 text-xl font-semibold",
              streak > 0 && "text-orange-500",
            )}
          >
            <Flame className={cn("h-5 w-5", streak > 0 && "fill-orange-500")} />
            {streak}
          </div>
          <div className="text-xs text-muted-foreground">{t("streakLabel")}</div>
        </div>
      </div>
      <Button onClick={onDone}>{tCommon("close")}</Button>
    </div>
  );
}

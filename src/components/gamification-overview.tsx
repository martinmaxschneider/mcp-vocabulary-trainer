"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Flame, Trophy } from "lucide-react";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { GoalRing } from "~/components/goal-ring";
import { WeekStreakBar } from "~/components/week-streak-bar";
import { cn } from "~/lib/utils";

export function GamificationOverview({
  focusLang,
  showAll = false,
}: {
  focusLang?: string;
  showAll?: boolean;
}) {
  const t = useTranslations("gamification");
  const tLang = useTranslations("languages");
  const { data, isLoading } = api.gamification.getStatus.useQuery();

  if (isLoading || !data) return null;

  const languages = data.languages.filter((lang) => {
    if (!showAll && focusLang) return lang.language === focusLang;
    return lang.xp > 0 || lang.masteryPercent > 0;
  });

  return (
    <Card className="mb-8">
      <CardContent className="grid gap-6 p-6 md:grid-cols-[auto_1fr_auto] md:items-center">
        <div className="flex items-center gap-4">
          <GoalRing value={data.xpToday} max={data.dailyGoalXp} size={80}>
            <div className="text-center">
              <div className="text-sm font-bold leading-none">{data.xpToday}</div>
              <div className="text-[10px] text-muted-foreground">XP</div>
            </div>
          </GoalRing>
          <div>
            <p className="text-sm font-medium">{t("dailyGoal")}</p>
            <p className="text-xs text-muted-foreground">
              {t("xpToday", { xp: data.xpToday, goal: data.dailyGoalXp })}
            </p>
            <p
              className={cn(
                "mt-1 inline-flex items-center gap-1 text-sm font-semibold",
                data.goalMet ? "text-orange-500" : "text-muted-foreground",
              )}
            >
              <Flame className={cn("h-4 w-4", data.goalMet && "fill-orange-500")} />
              {t("streakDays", { count: data.streak })}
            </p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {t("thisWeek")}
          </p>
          <WeekStreakBar week={data.week} />
        </div>

        <div className="flex flex-col items-start gap-2 md:items-end">
          <div className="flex flex-wrap gap-2">
            {languages.map((lang) => (
                <Badge key={lang.language} variant="secondary" className="gap-1">
                  {tLang(lang.language)}
                  <span className="tabular-nums">{lang.masteryPercent}%</span>
                  <span className="text-muted-foreground">
                    {t(`levels.${lang.levelKey}` as "levels.beginner")}
                  </span>
                </Badge>
              ))}
          </div>
          <Button asChild variant="ghost" size="sm" className="gap-1">
            <Link href="/achievements">
              <Trophy className="h-4 w-4" />
              {t("viewAchievements")}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

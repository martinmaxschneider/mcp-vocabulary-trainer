"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Flame } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { api } from "~/trpc/client";
import { cn } from "~/lib/utils";
import { GoalRing } from "~/components/goal-ring";
import { WeekStreakBar } from "~/components/week-streak-bar";

export function StreakIndicator() {
  const t = useTranslations("gamification");
  const { data } = api.gamification.getStatus.useQuery();
  const streak = data?.streak ?? 0;
  const goalMet = data?.goalMet ?? false;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("streakAria", { count: streak })}
          className={cn(
            "relative w-auto min-w-10 gap-1 px-2",
            goalMet ? "text-orange-500" : "text-muted-foreground",
          )}
        >
          <Flame
            className={cn("h-5 w-5", goalMet && "fill-orange-500")}
          />
          <span className="text-sm font-semibold tabular-nums">{streak}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-4">
        <div className="mb-3 flex items-center gap-3">
          <GoalRing value={data?.xpToday ?? 0} max={data?.dailyGoalXp ?? 50}>
            <Flame
              className={cn(
                "h-5 w-5",
                goalMet ? "fill-orange-500 text-orange-500" : "text-muted-foreground",
              )}
            />
          </GoalRing>
          <div>
            <p className="text-sm font-semibold">
              {t("streakDays", { count: streak })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("xpToday", {
                xp: data?.xpToday ?? 0,
                goal: data?.dailyGoalXp ?? 50,
              })}
            </p>
            {data?.longestStreak ? (
              <p className="text-xs text-muted-foreground">
                {t("longestStreak", { count: data.longestStreak })}
              </p>
            ) : null}
          </div>
        </div>
        <WeekStreakBar week={data?.week ?? []} className="mb-3" />
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link href="/achievements">{t("viewAchievements")}</Link>
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { cn } from "~/lib/utils";
import type { WeekDayStatus } from "~/lib/gamification-types";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function weekdayKey(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1).getDay();
  return WEEKDAY_KEYS[weekday] ?? "sun";
}

export function WeekStreakBar({
  week,
  className,
}: {
  week: WeekDayStatus[];
  className?: string;
}) {
  const t = useTranslations("gamification");

  return (
    <div className={cn("flex justify-between gap-1", className)}>
      {week.map((day) => (
        <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] uppercase text-muted-foreground">
            {t(`weekday.${weekdayKey(day.date)}`)}
          </span>
          <div
            className={cn(
              "h-2 w-full rounded-full",
              day.goalMet ? "bg-orange-500" : "bg-muted",
            )}
            title={`${day.date}: ${day.xp} XP`}
          />
        </div>
      ))}
    </div>
  );
}

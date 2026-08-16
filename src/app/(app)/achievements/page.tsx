"use client";

import { useTranslations } from "next-intl";
import {
  Flame,
  Zap,
  Trophy,
  Sparkles,
  Shield,
  NotebookPen,
  BookOpen,
  RotateCcw,
  Lock,
} from "lucide-react";
import { api } from "~/trpc/client";
import { Card, CardContent } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { cn } from "~/lib/utils";
import type { AchievementIcon } from "~/lib/achievements";

const ICON_MAP: Record<AchievementIcon, typeof Flame> = {
  flame: Flame,
  zap: Zap,
  trophy: Trophy,
  sparkles: Sparkles,
  shield: Shield,
  notebook: NotebookPen,
  bookOpen: BookOpen,
  rotateCcw: RotateCcw,
};

export default function AchievementsPage() {
  const t = useTranslations("gamification");
  const { data, isLoading } = api.gamification.getAchievements.useQuery();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold">{t("achievementsTitle")}</h1>
        <p className="text-muted-foreground">{t("achievementsSubtitle")}</p>
      </div>

      {isLoading || !data ? (
        <p className="text-muted-foreground">{t("loadingAchievements")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.map((achievement) => {
            const Icon = ICON_MAP[achievement.icon] ?? Trophy;
            const percent =
              achievement.target > 0
                ? Math.round((achievement.current / achievement.target) * 100)
                : 0;
            return (
              <Card
                key={achievement.key}
                className={cn(!achievement.unlocked && "opacity-70")}
              >
                <CardContent className="flex gap-4 p-5">
                  <div
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
                      achievement.unlocked
                        ? "bg-orange-100 text-orange-600 dark:bg-orange-950"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {achievement.unlocked ? (
                      <Icon className="h-6 w-6" />
                    ) : (
                      <Lock className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold">
                      {t(
                        `achievements.${achievement.key}.title` as "achievements.streak_3.title",
                      )}
                    </h2>
                    <p className="mb-2 text-sm text-muted-foreground">
                      {t(
                        `achievements.${achievement.key}.description` as "achievements.streak_3.description",
                      )}
                    </p>
                    {achievement.unlocked ? (
                      <p className="text-xs text-orange-600">
                        {t("unlockedOn", {
                          date: new Date(achievement.unlockedAt!).toLocaleDateString(),
                        })}
                      </p>
                    ) : (
                      <div>
                        <Progress value={percent} className="h-2" />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("achievementProgress", {
                            current: achievement.current,
                            target: achievement.target,
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

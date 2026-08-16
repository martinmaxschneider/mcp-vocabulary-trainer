"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import {
  Flame,
  Sparkles,
  Trophy,
  Zap,
  Shield,
  NotebookPen,
  BookOpen,
  RotateCcw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { useToast } from "~/hooks/use-toast";
import { api } from "~/trpc/client";
import { ACHIEVEMENT_BY_KEY, type AchievementIcon } from "~/lib/achievements";
import {
  maxCelebrationIntensity,
  resolveCelebrations,
} from "~/lib/gamification-config";
import { fireConfetti } from "~/lib/fire-confetti";
import type { GamificationResult } from "~/lib/gamification-types";

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

type CelebrateOptions = {
  perfectSession?: boolean;
  sessionAnswers?: number;
};

type GamificationContextValue = {
  celebrate: (
    result: GamificationResult | null | undefined,
    options?: CelebrateOptions,
  ) => void;
};

const GamificationContext = createContext<GamificationContextValue | null>(null);

export function useCelebrate() {
  const ctx = useContext(GamificationContext);
  if (!ctx) {
    throw new Error("useCelebrate must be used within GamificationProvider");
  }
  return ctx.celebrate;
}

export function GamificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("gamification");
  const { toast } = useToast();
  const utils = api.useUtils();
  const [unlockKeys, setUnlockKeys] = useState<string[]>([]);

  const celebrate = useCallback(
    (
      result: GamificationResult | null | undefined,
      options?: CelebrateOptions,
    ) => {
      if (!result) return;
      void utils.gamification.getStatus.invalidate();
      void utils.gamification.getAchievements.invalidate();

      const events = resolveCelebrations({
        goalReachedNow: result.goalReachedNow,
        streakMilestoneNow: result.streakMilestoneNow,
        newAchievementKeys: result.newAchievements.map((item) => item.key),
        perfectSession: options?.perfectSession,
        sessionAnswers: options?.sessionAnswers,
      });
      const intensity = maxCelebrationIntensity(events);
      fireConfetti(intensity);

      if (result.newAchievements.length > 0) {
        setUnlockKeys(result.newAchievements.map((item) => item.key));
        return;
      }

      const streakEvent = events.find((event) => event.kind === "streakMilestone");
      if (streakEvent?.streakDays) {
        toast({
          title: t("streakMilestoneTitle", { days: streakEvent.streakDays }),
          description: t("streakMilestoneDesc"),
        });
        return;
      }

      if (events.some((event) => event.kind === "dailyGoal")) {
        toast({
          title: t("goalReachedTitle"),
          description: t("goalReachedDesc"),
        });
        return;
      }

      if (events.some((event) => event.kind === "perfectSession")) {
        toast({
          title: t("perfectSessionTitle"),
          description: t("perfectSessionDesc"),
        });
      }
    },
    [t, toast, utils],
  );

  const value = useMemo(() => ({ celebrate }), [celebrate]);
  const currentKey = unlockKeys[0];
  const current = currentKey ? ACHIEVEMENT_BY_KEY[currentKey] : undefined;
  const Icon = current ? ICON_MAP[current.icon] : Trophy;

  return (
    <GamificationContext.Provider value={value}>
      {children}
      <Dialog
        open={Boolean(currentKey)}
        onOpenChange={(open) => {
          if (!open) setUnlockKeys((keys) => keys.slice(1));
        }}
      >
        <DialogContent className="max-w-sm text-center">
          <DialogHeader className="items-center">
            <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-950">
              <Icon className="h-8 w-8" />
            </div>
            <DialogTitle>{t("achievementUnlocked")}</DialogTitle>
            <DialogDescription>
              {currentKey
                ? t(`achievements.${currentKey}.title` as "achievements.streak_3.title")
                : null}
            </DialogDescription>
          </DialogHeader>
          {currentKey ? (
            <p className="text-sm text-muted-foreground">
              {t(
                `achievements.${currentKey}.description` as "achievements.streak_3.description",
              )}
            </p>
          ) : null}
          <Button
            onClick={() => setUnlockKeys((keys) => keys.slice(1))}
            className="w-full"
          >
            {unlockKeys.length > 1
              ? t("nextAchievement", { remaining: unlockKeys.length - 1 })
              : t("nice")}
          </Button>
        </DialogContent>
      </Dialog>
    </GamificationContext.Provider>
  );
}

import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  getAchievementStatus,
  getGamificationStatus,
  getOrCreateSettings,
  reportPerfectSession,
} from "~/server/gamification";

export const gamificationRouter = createTRPCRouter({
  getStatus: publicProcedure.query(async ({ ctx }) => {
    return getGamificationStatus(ctx.db, ctx.userId);
  }),

  getAchievements: publicProcedure.query(async ({ ctx }) => {
    return getAchievementStatus(ctx.db, ctx.userId);
  }),

  setDailyGoal: publicProcedure
    .input(
      z.object({
        dailyGoalXp: z.number().int().min(10).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const settings = await getOrCreateSettings(ctx.db, ctx.userId);
      return ctx.db.gamificationSettings.update({
        where: { id: settings.id },
        data: { dailyGoalXp: input.dailyGoalXp },
      });
    }),

  reportSession: publicProcedure
    .input(
      z.object({
        answers: z.number().int().min(0),
        correct: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return reportPerfectSession(ctx.db, ctx.userId, input);
    }),
});

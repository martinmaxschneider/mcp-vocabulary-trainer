import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const settingsRouter = createTRPCRouter({
  resetProgress: publicProcedure.mutation(async ({ ctx }) => {
    // Delete all UserProgress and ReviewLog entries
    await ctx.db.reviewLog.deleteMany({});
    await ctx.db.userProgress.deleteMany({});

    return { success: true };
  }),

  resetEntries: publicProcedure.mutation(async ({ ctx }) => {
    // Delete all Entries (cascades to Translations, UserProgress, ReviewLog)
    await ctx.db.entry.deleteMany({});

    return { success: true };
  }),

  resetDomains: publicProcedure.mutation(async ({ ctx }) => {
    // Delete all Domains (cascades to DomainEntry relationships)
    await ctx.db.domain.deleteMany({});

    return { success: true };
  }),

  resetEverything: publicProcedure.mutation(async ({ ctx }) => {
    // Delete everything in the correct order
    await ctx.db.reviewLog.deleteMany({});
    await ctx.db.userProgress.deleteMany({});
    await ctx.db.domainEntry.deleteMany({});
    await ctx.db.translation.deleteMany({});
    await ctx.db.entry.deleteMany({});
    await ctx.db.domain.deleteMany({});

    return { success: true };
  }),
});


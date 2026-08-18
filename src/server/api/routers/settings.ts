import { EmbeddingOwnerType } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  isUpdateLocked,
  readUpdateStatus,
  markUpdateStarting,
  startSelfUpdate,
} from "~/server/self-update";
import { resetGamification } from "~/server/gamification";
import { wipeAllSatzAudio } from "~/server/services/tts";

export const settingsRouter = createTRPCRouter({
  updateStatus: publicProcedure.query(() => {
    try {
      return readUpdateStatus();
    } catch {
      return {
        status: "idle" as const,
        step: null,
        startedAt: null,
        updatedAt: null,
        error: null,
        pid: null,
        log: "",
      };
    }
  }),

  startUpdate: publicProcedure.mutation(() => {
    if (process.env.NODE_ENV !== "production") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Updates are disabled in development",
      });
    }

    const current = readUpdateStatus();
    if (isUpdateLocked(current)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "An update is already running",
      });
    }

    markUpdateStarting();
    startSelfUpdate();
    return { started: true };
  }),

  resetProgress: publicProcedure.mutation(async ({ ctx }) => {
    // Delete all UserProgress and ReviewLog entries
    await ctx.db.reviewLog.deleteMany({});
    await ctx.db.userProgress.deleteMany({});
    await resetGamification(ctx.db, ctx.userId);

    return { success: true };
  }),

  resetEntries: publicProcedure.mutation(async ({ ctx }) => {
    await ctx.db.embedding.deleteMany({ where: { ownerType: EmbeddingOwnerType.ENTRY } });
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
    await ctx.db.worksheet.deleteMany({});
    await ctx.db.reviewLog.deleteMany({});
    await ctx.db.userProgress.deleteMany({});
    await resetGamification(ctx.db, ctx.userId);
    await ctx.db.domainEntry.deleteMany({});
    await ctx.db.translation.deleteMany({});
    await ctx.db.embedding.deleteMany({});
    await ctx.db.satzImportBatch.deleteMany({});
    await ctx.db.satz.deleteMany({});
    await wipeAllSatzAudio();
    await ctx.db.entry.deleteMany({});
    await ctx.db.domain.deleteMany({});

    return { success: true };
  }),
});


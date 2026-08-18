import { EmbeddingOwnerType } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  isUpdateLocked,
  readUpdateStatus,
  markUpdateStarting,
  startSelfUpdate,
} from "~/server/self-update";
import { resetGamification } from "~/server/gamification";
import { wipeAllSatzAudio } from "~/server/services/tts";
import {
  getAppSettings,
  updateAppSettings,
} from "~/server/services/ai-settings";
import {
  getProjectUsageSummary,
  listAiUsageLogs,
} from "~/server/services/ai-usage";
import {
  OPENROUTER_NOT_CONFIGURED,
  createSpeechMp3,
  getOpenRouterKeyInfo,
  isOpenRouterConfigured,
  listOpenRouterModels,
} from "~/server/services/openrouter";

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
    await ctx.db.aiUsageLog.deleteMany({});

    return { success: true };
  }),

  getAi: publicProcedure.query(async () => {
    const settings = await getAppSettings();
    return {
      ...settings,
      configured: isOpenRouterConfigured(),
    };
  }),

  updateAi: publicProcedure
    .input(
      z.object({
        chatModel: z.string().min(1).optional(),
        embeddingModel: z.string().min(1).optional(),
        ttsModel: z.string().min(1).optional(),
        ttsVoiceQuestion: z.string().min(1).optional(),
        ttsVoiceAnswer: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return updateAppSettings(input);
    }),

  listModels: publicProcedure.query(async () => {
    if (!isOpenRouterConfigured()) {
      return { chat: [], embedding: [], speech: [], error: "not_configured" as const };
    }
    try {
      return { ...(await listOpenRouterModels()), error: null };
    } catch {
      return { chat: [], embedding: [], speech: [], error: "unavailable" as const };
    }
  }),

  getBudget: publicProcedure.query(async () => {
    const project = await getProjectUsageSummary();
    if (!isOpenRouterConfigured()) {
      return { configured: false, key: null, project, error: null };
    }
    try {
      const key = await getOpenRouterKeyInfo();
      return { configured: true, key, project, error: null };
    } catch {
      return {
        configured: true,
        key: null,
        project,
        error: "unavailable" as const,
      };
    }
  }),

  listUsageLogs: publicProcedure.query(() => listAiUsageLogs(50)),

  testTts: publicProcedure
    .input(
      z.object({
        text: z.string().min(1).max(500),
        voice: z.string().min(1),
        model: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      if (!isOpenRouterConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: OPENROUTER_NOT_CONFIGURED,
        });
      }
      const buffer = await createSpeechMp3({
        text: input.text,
        voice: input.voice,
        model: input.model,
      });
      return {
        audioBase64: buffer.toString("base64"),
        mimeType: "audio/mpeg" as const,
      };
    }),
});


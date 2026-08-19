import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  CardType,
  DailyPackageStatus,
  DailyTestResult,
} from "@prisma/client";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  DEFAULT_DAILY_CONFIG,
  MAX_DAILY_COUNT,
  clampCount,
  parseDailyPackageConfig,
} from "~/lib/daily";
import { localDateString } from "~/lib/gamification-config";
import { processRequestedAudio } from "~/server/services/tts";
import { recordActivity } from "~/server/gamification";
import {
  buildDailySelection,
  completeDailyToLeitner,
  computeBurndown,
  countNewPools,
  findOpenPackage,
  itemsAudioReady,
  listPackages,
  requestDailyAudio,
  toHydratedPackage,
} from "~/server/services/daily";

const countSchema = z.number().int().min(0).max(MAX_DAILY_COUNT);

async function loadPackageOrThrow(
  db: typeof import("~/server/db").db,
  userId: string,
  id: string,
) {
  const pkg = await db.dailyPackage.findFirst({
    where: { id, userId },
    include: { items: true },
  });
  if (!pkg) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Daily package not found" });
  }
  return pkg;
}

export const dailyRouter = createTRPCRouter({
  today: publicProcedure
    .input(z.object({ targetLang: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const date = localDateString();
      const [pkg, settings, pool, burndown, packages] = await Promise.all([
        findOpenPackage(ctx.db, ctx.userId, input.targetLang, date),
        ctx.db.dailySettings.findUnique({
          where: {
            userId_targetLang: {
              userId: ctx.userId,
              targetLang: input.targetLang,
            },
          },
        }),
        countNewPools(ctx.db, ctx.userId, input.targetLang),
        computeBurndown(ctx.db, ctx.userId, input.targetLang),
        listPackages(ctx.db, ctx.userId, input.targetLang),
      ]);

      const now = new Date();
      const [dueVocab, dueSatz, dueConj] = await Promise.all([
        ctx.db.userProgress.count({
          where: {
            userId: ctx.userId,
            targetLang: input.targetLang,
            cardType: CardType.VOCAB,
            nextReviewAt: { lte: now },
          },
        }),
        ctx.db.satzProgress.count({
          where: {
            userId: ctx.userId,
            targetLang: input.targetLang,
            nextReviewAt: { lte: now },
          },
        }),
        ctx.db.userProgress.count({
          where: {
            userId: ctx.userId,
            targetLang: input.targetLang,
            cardType: CardType.CONJUGATION,
            nextReviewAt: { lte: now },
          },
        }),
      ]);

      return {
        date,
        package: pkg ? await toHydratedPackage(ctx.db, pkg) : null,
        settings: {
          currentGrammarTopicId: settings?.currentGrammarTopicId ?? null,
          lastPackageConfig:
            parseDailyPackageConfig(settings?.lastPackageConfig) ??
            DEFAULT_DAILY_CONFIG,
        },
        pool,
        due: { vocab: dueVocab, satz: dueSatz, conj: dueConj },
        burndown,
        packages,
      };
    }),

  list: publicProcedure
    .input(
      z.object({
        targetLang: z.string().min(1),
        limit: z.number().int().min(1).max(90).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return listPackages(
        ctx.db,
        ctx.userId,
        input.targetLang,
        input.limit ?? 30,
      );
    }),

  getPackage: publicProcedure
    .input(
      z
        .object({
          id: z.string().optional(),
          targetLang: z.string().optional(),
          date: z.string().optional(),
        })
        .refine((value) => Boolean(value.id || value.targetLang), {
          message: "id or targetLang is required",
        }),
    )
    .query(async ({ ctx, input }) => {
      const pkg = input.id
        ? await loadPackageOrThrow(ctx.db, ctx.userId, input.id)
        : await findOpenPackage(
            ctx.db,
            ctx.userId,
            input.targetLang!,
            input.date ?? localDateString(),
          );
      if (!pkg) return null;
      return toHydratedPackage(ctx.db, pkg);
    }),

  updateSettings: publicProcedure
    .input(
      z.object({
        targetLang: z.string().min(1),
        currentGrammarTopicId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.dailySettings.upsert({
        where: {
          userId_targetLang: {
            userId: ctx.userId,
            targetLang: input.targetLang,
          },
        },
        create: {
          userId: ctx.userId,
          targetLang: input.targetLang,
          currentGrammarTopicId: input.currentGrammarTopicId,
        },
        update: {
          ...(input.currentGrammarTopicId !== undefined
            ? { currentGrammarTopicId: input.currentGrammarTopicId }
            : {}),
        },
      });
    }),

  createPackage: publicProcedure
    .input(
      z.object({
        targetLang: z.string().min(1),
        satzCount: countSchema,
        vocabCount: countSchema,
        conjCount: countSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const satzCount = clampCount(input.satzCount);
      const vocabCount = clampCount(input.vocabCount);
      const conjCount = clampCount(input.conjCount);
      if (satzCount + vocabCount + conjCount === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "At least one item is required",
        });
      }

      const date = localDateString();
      const existing = await findOpenPackage(
        ctx.db,
        ctx.userId,
        input.targetLang,
        date,
      );
      if (existing && existing.status !== DailyPackageStatus.DRAFT) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An open daily package already exists for today",
        });
      }
      if (existing?.status === DailyPackageStatus.DRAFT) {
        await ctx.db.dailyPackage.delete({ where: { id: existing.id } });
      }

      const settings = await ctx.db.dailySettings.upsert({
        where: {
          userId_targetLang: {
            userId: ctx.userId,
            targetLang: input.targetLang,
          },
        },
        create: {
          userId: ctx.userId,
          targetLang: input.targetLang,
          lastPackageConfig: { satzCount, vocabCount, conjCount },
        },
        update: {
          lastPackageConfig: { satzCount, vocabCount, conjCount },
        },
      });

      const selected = await buildDailySelection(
        ctx.db,
        ctx.userId,
        input.targetLang,
        { satzCount, vocabCount, conjCount },
        settings.currentGrammarTopicId,
      );

      if (selected.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No new items available for this language",
        });
      }

      const pkg = await ctx.db.dailyPackage.create({
        data: {
          userId: ctx.userId,
          targetLang: input.targetLang,
          date,
          status: DailyPackageStatus.DRAFT,
          targetSatzCount: satzCount,
          targetVocabCount: vocabCount,
          targetConjCount: conjCount,
          items: {
            create: selected.map((item, position) => ({
              itemType: item.itemType,
              refId: item.refId,
              refKey: item.refKey,
              domainIdSnapshot: item.domainId,
              grammarTopicBonusApplied: item.grammarBonus,
              position,
            })),
          },
        },
        include: { items: true },
      });

      await requestDailyAudio(selected, input.targetLang);
      return toHydratedPackage(ctx.db, pkg);
    }),

  activatePackage: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const pkg = await loadPackageOrThrow(ctx.db, ctx.userId, input.id);
      if (pkg.status !== DailyPackageStatus.DRAFT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only DRAFT packages can be activated",
        });
      }
      const hydrated = await toHydratedPackage(ctx.db, pkg);
      if (!itemsAudioReady(hydrated.items)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Audio is not ready for every item",
        });
      }
      const updated = await ctx.db.dailyPackage.update({
        where: { id: pkg.id },
        data: {
          status: DailyPackageStatus.ACTIVE,
          activatedAt: new Date(),
        },
        include: { items: true },
      });
      return toHydratedPackage(ctx.db, updated);
    }),

  startTest: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const pkg = await loadPackageOrThrow(ctx.db, ctx.userId, input.id);
      if (pkg.status !== DailyPackageStatus.ACTIVE) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only ACTIVE packages can start the test",
        });
      }
      const updated = await ctx.db.dailyPackage.update({
        where: { id: pkg.id },
        data: { status: DailyPackageStatus.TESTING },
        include: { items: true },
      });
      return toHydratedPackage(ctx.db, updated);
    }),

  submitTestAnswer: publicProcedure
    .input(
      z.object({
        itemId: z.string(),
        isCorrect: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.dailyPackageItem.findUnique({
        where: { id: input.itemId },
        include: { package: true },
      });
      if (!item || item.package.userId !== ctx.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      }
      if (item.package.status !== DailyPackageStatus.TESTING) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Package is not in TESTING",
        });
      }
      await ctx.db.dailyPackageItem.update({
        where: { id: item.id },
        data: {
          testResult: input.isCorrect
            ? DailyTestResult.CORRECT
            : DailyTestResult.WRONG,
        },
      });
      const pkg = await loadPackageOrThrow(ctx.db, ctx.userId, item.packageId);
      return toHydratedPackage(ctx.db, pkg);
    }),

  completePackage: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const pkg = await loadPackageOrThrow(ctx.db, ctx.userId, input.id);
      if (pkg.status !== DailyPackageStatus.TESTING) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only TESTING packages can be completed",
        });
      }
      if (pkg.items.some((item) => item.testResult === DailyTestResult.PENDING)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "All items must be answered first",
        });
      }

      await completeDailyToLeitner(ctx.db, ctx.userId, pkg);
      const updated = await ctx.db.dailyPackage.update({
        where: { id: pkg.id },
        data: {
          status: DailyPackageStatus.PRODUCTIVE,
          completedAt: new Date(),
        },
        include: { items: true },
      });

      const gamification = await recordActivity(ctx.db, ctx.userId, {
        items: pkg.items.map((item) => ({
          targetLang: pkg.targetLang,
          isCorrect: item.testResult === DailyTestResult.CORRECT,
        })),
      });

      return {
        package: await toHydratedPackage(ctx.db, updated),
        gamification,
      };
    }),

  abandonPackage: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const pkg = await loadPackageOrThrow(ctx.db, ctx.userId, input.id);
      if (pkg.status === DailyPackageStatus.PRODUCTIVE) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Completed packages cannot be abandoned",
        });
      }
      const updated = await ctx.db.dailyPackage.update({
        where: { id: pkg.id },
        data: { status: DailyPackageStatus.ABANDONED },
        include: { items: true },
      });
      return toHydratedPackage(ctx.db, updated);
    }),

  burndown: publicProcedure
    .input(z.object({ targetLang: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return computeBurndown(ctx.db, ctx.userId, input.targetLang);
    }),

  processAudio: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(10).default(2) }).optional())
    .mutation(async ({ input }) => {
      return processRequestedAudio(input?.limit ?? 2);
    }),
});

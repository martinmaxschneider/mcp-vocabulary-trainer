import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { SatzPriority, type Prisma } from "@prisma/client";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { applyLeitnerResult, MAX_BOX, MIN_BOX } from "~/lib/leitner";
import { recordActivity } from "~/server/gamification";

type BoxCounts = Record<1 | 2 | 3 | 4 | 5 | 6, number>;

function emptyBoxCounts(): BoxCounts {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
}

function addBoxCount(counts: BoxCounts, box: number, amount: number) {
  if (box >= MIN_BOX && box <= MAX_BOX) {
    counts[box as keyof BoxCounts] += amount;
  }
}

function satzFilterWhere(input: {
  domainId?: string;
  priority?: SatzPriority;
}): Prisma.SatzWhereInput {
  return {
    ...(input.domainId && {
      domains: { some: { domainId: input.domainId } },
    }),
    ...(input.priority && { priority: input.priority }),
  };
}

const reviewFilterSchema = {
  targetLang: z.string().min(1),
  domainId: z.string().optional(),
  priority: z.nativeEnum(SatzPriority).optional(),
  box: z.number().int().min(MIN_BOX).max(MAX_BOX).optional(),
};

export const satzReviewRouter = createTRPCRouter({
  stats: publicProcedure
    .input(z.object(reviewFilterSchema))
    .query(async ({ ctx, input }) => {
      const userId = ctx.userId;
      const now = new Date();
      const satzWhere = satzFilterWhere(input);
      const hasTranslation: Prisma.SatzWhereInput = {
        ...satzWhere,
        translations: { some: { lang: input.targetLang } },
      };

      const dueProgresses = await ctx.db.satzProgress.findMany({
        where: {
          userId,
          targetLang: input.targetLang,
          nextReviewAt: { lte: now },
          ...(input.box !== undefined && { box: input.box }),
          satz: hasTranslation,
        },
        select: { box: true },
      });

      const includeUnseen = input.box === undefined || input.box === MIN_BOX;
      const newCount = includeUnseen
        ? await ctx.db.satz.count({
            where: {
              ...hasTranslation,
              progresses: {
                none: { userId, targetLang: input.targetLang },
              },
            },
          })
        : 0;

      const boxCounts = emptyBoxCounts();
      for (const row of dueProgresses) {
        addBoxCount(boxCounts, row.box, 1);
      }
      addBoxCount(boxCounts, MIN_BOX, newCount);

      return {
        due: dueProgresses.length + newCount,
        newCount,
        boxCounts,
      };
    }),

  queue: publicProcedure
    .input(
      z.object({
        ...reviewFilterSchema,
        limit: z.number().min(1).max(100).default(20),
        practice: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.userId;
      const now = new Date();
      const satzWhere = satzFilterWhere(input);
      const hasTranslation: Prisma.SatzWhereInput = {
        ...satzWhere,
        translations: { some: { lang: input.targetLang } },
      };

      if (input.practice) {
        const items = await ctx.db.satz.findMany({
          where: hasTranslation,
          take: input.limit,
          orderBy: { updatedAt: "desc" },
          include: {
            translations: { where: { lang: input.targetLang } },
            domains: { include: { domain: true } },
          },
        });
        return {
          cards: items.map((satz) => ({
            satzId: satz.id,
            mainText: satz.mainText,
            trigger: satz.trigger,
            priority: satz.priority,
            box: MIN_BOX,
            nextReviewAt: now,
            mainAudioUrl: satz.mainAudioUrl,
            mainAudioStatus: satz.mainAudioStatus,
            updatedAt: satz.updatedAt,
            translation: satz.translations[0] ?? null,
            domains: satz.domains.map((d) => d.domain),
          })),
          boxCounts: emptyBoxCounts(),
          due: items.length,
          newCount: items.length,
          totalAvailable: items.length,
        };
      }

      const dueProgresses = await ctx.db.satzProgress.findMany({
        where: {
          userId,
          targetLang: input.targetLang,
          nextReviewAt: { lte: now },
          ...(input.box !== undefined && { box: input.box }),
          satz: hasTranslation,
        },
        take: input.limit,
        orderBy: { nextReviewAt: "asc" },
        include: {
          satz: {
            include: {
              translations: { where: { lang: input.targetLang } },
              domains: { include: { domain: true } },
            },
          },
        },
      });

      const includeUnseen = input.box === undefined || input.box === MIN_BOX;
      const remaining = Math.max(0, input.limit - dueProgresses.length);
      const unseen =
        includeUnseen && remaining > 0
          ? await ctx.db.satz.findMany({
              where: {
                ...hasTranslation,
                progresses: {
                  none: { userId, targetLang: input.targetLang },
                },
              },
              take: remaining,
              orderBy: { createdAt: "asc" },
              include: {
                translations: { where: { lang: input.targetLang } },
                domains: { include: { domain: true } },
              },
            })
          : [];

      const cards = [
        ...dueProgresses.map((progress) => ({
          satzId: progress.satzId,
          mainText: progress.satz.mainText,
          trigger: progress.satz.trigger,
          priority: progress.satz.priority,
          box: progress.box,
          nextReviewAt: progress.nextReviewAt,
          mainAudioUrl: progress.satz.mainAudioUrl,
          mainAudioStatus: progress.satz.mainAudioStatus,
          updatedAt: progress.satz.updatedAt,
          translation: progress.satz.translations[0] ?? null,
          domains: progress.satz.domains.map((d) => d.domain),
        })),
        ...unseen.map((satz) => ({
          satzId: satz.id,
          mainText: satz.mainText,
          trigger: satz.trigger,
          priority: satz.priority,
          box: MIN_BOX,
          nextReviewAt: now,
          mainAudioUrl: satz.mainAudioUrl,
          mainAudioStatus: satz.mainAudioStatus,
          updatedAt: satz.updatedAt,
          translation: satz.translations[0] ?? null,
          domains: satz.domains.map((d) => d.domain),
        })),
      ];

      const dueCount = await ctx.db.satzProgress.count({
        where: {
          userId,
          targetLang: input.targetLang,
          nextReviewAt: { lte: now },
          ...(input.box !== undefined && { box: input.box }),
          satz: hasTranslation,
        },
      });
      const newCount = includeUnseen
        ? await ctx.db.satz.count({
            where: {
              ...hasTranslation,
              progresses: {
                none: { userId, targetLang: input.targetLang },
              },
            },
          })
        : 0;
      const dueByBox = await ctx.db.satzProgress.groupBy({
        by: ["box"],
        where: {
          userId,
          targetLang: input.targetLang,
          nextReviewAt: { lte: now },
          ...(input.box !== undefined && { box: input.box }),
          satz: hasTranslation,
        },
        _count: { _all: true },
      });
      const boxCounts = emptyBoxCounts();
      for (const row of dueByBox) {
        addBoxCount(boxCounts, row.box, row._count._all);
      }
      addBoxCount(boxCounts, MIN_BOX, newCount);

      return {
        cards,
        totalAvailable: dueCount + newCount,
        boxCounts,
      };
    }),

  grade: publicProcedure
    .input(
      z.object({
        satzId: z.string(),
        targetLang: z.string().min(1),
        isCorrect: z.boolean(),
        skipProgress: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const satz = await ctx.db.satz.findUnique({
        where: { id: input.satzId },
        include: {
          translations: { where: { lang: input.targetLang } },
        },
      });
      if (!satz) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Satz not found" });
      }
      const translation = satz.translations[0];
      if (!translation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No translation found for language: ${input.targetLang}`,
        });
      }

      const existing = await ctx.db.satzProgress.findUnique({
        where: {
          userId_satzId_targetLang: {
            userId: ctx.userId,
            satzId: input.satzId,
            targetLang: input.targetLang,
          },
        },
      });

      const boxBefore = existing?.box ?? MIN_BOX;
      if (input.skipProgress) {
        return {
          satzId: input.satzId,
          targetLang: input.targetLang,
          isCorrect: input.isCorrect,
          expected: translation.text,
          boxBefore,
          boxAfter: boxBefore,
          nextReviewAt: existing?.nextReviewAt ?? new Date(),
          correctCount: existing?.correctCount ?? 0,
          wrongCount: existing?.wrongCount ?? 0,
          gamification: null,
        };
      }
      const { boxAfter, nextReviewAt } = applyLeitnerResult(
        boxBefore,
        input.isCorrect,
      );

      const progress = existing
        ? await ctx.db.satzProgress.update({
            where: { id: existing.id },
            data: {
              box: boxAfter,
              nextReviewAt,
              correctCount: input.isCorrect
                ? existing.correctCount + 1
                : existing.correctCount,
              wrongCount: input.isCorrect
                ? existing.wrongCount
                : existing.wrongCount + 1,
              lastReviewedAt: new Date(),
            },
          })
        : await ctx.db.satzProgress.create({
            data: {
              userId: ctx.userId,
              satzId: input.satzId,
              targetLang: input.targetLang,
              box: boxAfter,
              nextReviewAt,
              correctCount: input.isCorrect ? 1 : 0,
              wrongCount: input.isCorrect ? 0 : 1,
              lastReviewedAt: new Date(),
            },
          });

      await ctx.db.satzReviewLog.create({
        data: {
          satzProgressId: progress.id,
          isCorrect: input.isCorrect,
        },
      });

      const gamification = await recordActivity(ctx.db, ctx.userId, {
        items: [
          {
            targetLang: input.targetLang,
            isCorrect: input.isCorrect,
          },
        ],
      });

      return {
        satzId: input.satzId,
        targetLang: input.targetLang,
        isCorrect: input.isCorrect,
        expected: translation.text,
        boxBefore,
        boxAfter,
        nextReviewAt,
        correctCount: progress.correctCount,
        wrongCount: progress.wrongCount,
        gamification,
      };
    }),
});

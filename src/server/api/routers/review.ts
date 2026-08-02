import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { EntryType, WordCategory } from "@prisma/client";
import { matchAnswer } from "~/lib/matching";
import {
  MAX_BOX,
  MIN_BOX,
  nextBoxOnCorrect,
  nextBoxOnWrong,
  scheduleNextReview,
} from "~/lib/leitner";

function entryDomainFilter(domainIds?: string[]) {
  if (!domainIds || domainIds.length === 0) return undefined;
  return {
    domains: {
      some: {
        domainId: { in: domainIds },
      },
    },
  };
}

function mapCardWithoutSolution(progress: {
  id: string;
  box: number;
  correctCount: number;
  wrongCount: number;
  nextReviewAt: Date;
  entry: {
    id: string;
    mainText: string;
    type: EntryType;
    note: string | null;
    category: WordCategory | null;
    domains: Array<{ domain: { id: string; name: string } }>;
  };
}) {
  return {
    id: progress.id,
    entryId: progress.entry.id,
    mainText: progress.entry.mainText,
    type: progress.entry.type,
    category: progress.entry.category,
    note: progress.entry.note,
    box: progress.box,
    correctCount: progress.correctCount,
    wrongCount: progress.wrongCount,
    nextReviewAt: progress.nextReviewAt,
    domains: progress.entry.domains.map((d) => d.domain),
  };
}

function expectedAnswers(text: string, variants: string[]): string[] {
  return [text, ...variants.filter((v) => v && v !== text)];
}

export const reviewRouter = createTRPCRouter({
  getDue: publicProcedure
    .input(
      z.object({
        targetLang: z.string(),
        domainIds: z.array(z.string()).optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.userId;
      const now = new Date();
      const domainFilter = entryDomainFilter(input.domainIds);

      const dueProgresses = await ctx.db.userProgress.findMany({
        where: {
          userId,
          targetLang: input.targetLang,
          nextReviewAt: { lte: now },
          ...(domainFilter ? { entry: domainFilter } : {}),
        },
        take: input.limit,
        orderBy: { nextReviewAt: "asc" },
        include: {
          entry: {
            include: {
              translations: {
                where: { lang: input.targetLang },
              },
              domains: {
                include: { domain: true },
              },
            },
          },
        },
      });

      const entriesWithoutProgress = await ctx.db.entry.findMany({
        where: {
          ...(domainFilter || {}),
          translations: {
            some: { lang: input.targetLang },
          },
          progresses: {
            none: {
              userId,
              targetLang: input.targetLang,
            },
          },
        },
        take: Math.max(0, input.limit - dueProgresses.length),
        include: {
          translations: {
            where: { lang: input.targetLang },
          },
          domains: {
            include: { domain: true },
          },
        },
      });

      const newProgresses = await Promise.all(
        entriesWithoutProgress.map(async (entry) => {
          const progress = await ctx.db.userProgress.create({
            data: {
              userId,
              entryId: entry.id,
              targetLang: input.targetLang,
              box: MIN_BOX,
              nextReviewAt: now,
            },
            include: {
              entry: {
                include: {
                  translations: {
                    where: { lang: input.targetLang },
                  },
                  domains: {
                    include: { domain: true },
                  },
                },
              },
            },
          });
          return progress;
        })
      );

      const allCards = [...dueProgresses, ...newProgresses];

      const totalDueCount = await ctx.db.userProgress.count({
        where: {
          userId,
          targetLang: input.targetLang,
          nextReviewAt: { lte: now },
          ...(domainFilter ? { entry: domainFilter } : {}),
        },
      });

      const totalNewCount = await ctx.db.entry.count({
        where: {
          ...(domainFilter || {}),
          translations: {
            some: { lang: input.targetLang },
          },
          progresses: {
            none: {
              userId,
              targetLang: input.targetLang,
            },
          },
        },
      });

      const totalAvailable = totalDueCount + totalNewCount;

      return {
        cards: allCards.map((progress) => ({
          ...mapCardWithoutSolution(progress),
          // UI still needs translation after submit; MCP strips this
          translation: progress.entry.translations[0],
        })),
        totalAvailable,
      };
    }),

  listCards: publicProcedure
    .input(
      z.object({
        targetLang: z.string(),
        domainIds: z.array(z.string()).optional(),
        dueOnly: z.boolean().optional(),
        box: z.number().int().min(MIN_BOX).max(MAX_BOX).optional(),
        boxes: z.array(z.number().int().min(MIN_BOX).max(MAX_BOX)).optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.userId;
      const now = new Date();
      const domainFilter = entryDomainFilter(input.domainIds);
      const boxFilter =
        input.boxes && input.boxes.length > 0
          ? { box: { in: input.boxes } }
          : input.box !== undefined
            ? { box: input.box }
            : {};

      const progresses = await ctx.db.userProgress.findMany({
        where: {
          userId,
          targetLang: input.targetLang,
          ...boxFilter,
          ...(input.dueOnly ? { nextReviewAt: { lte: now } } : {}),
          ...(domainFilter ? { entry: domainFilter } : {}),
        },
        take: input.limit,
        orderBy: [{ nextReviewAt: "asc" }, { box: "asc" }],
        include: {
          entry: {
            include: {
              domains: {
                include: { domain: true },
              },
            },
          },
        },
      });

      // Include brand-new entries (no progress) when not filtering by box
      // and when dueOnly or unrestricted listing.
      let newCards: ReturnType<typeof mapCardWithoutSolution>[] = [];
      const boxesRestrict =
        (input.boxes && input.boxes.length > 0) || input.box !== undefined;

      if (!boxesRestrict || input.box === MIN_BOX || input.boxes?.includes(MIN_BOX)) {
        const remaining = Math.max(0, input.limit - progresses.length);
        if (remaining > 0 && (input.dueOnly || !input.dueOnly)) {
          const entriesWithoutProgress = await ctx.db.entry.findMany({
            where: {
              ...(domainFilter || {}),
              translations: {
                some: { lang: input.targetLang },
              },
              progresses: {
                none: {
                  userId,
                  targetLang: input.targetLang,
                },
              },
            },
            take: remaining,
            include: {
              domains: {
                include: { domain: true },
              },
            },
          });

          newCards = entriesWithoutProgress.map((entry) => ({
            id: `new:${entry.id}`,
            entryId: entry.id,
            mainText: entry.mainText,
            type: entry.type,
            category: entry.category,
            note: entry.note,
            box: MIN_BOX,
            correctCount: 0,
            wrongCount: 0,
            nextReviewAt: now,
            domains: entry.domains.map((d) => d.domain),
          }));
        }
      }

      return {
        cards: [
          ...progresses.map(mapCardWithoutSolution),
          ...newCards,
        ],
        total: progresses.length + newCards.length,
      };
    }),

  submitAnswer: publicProcedure
    .input(
      z.object({
        entryId: z.string(),
        targetLang: z.string(),
        userAnswer: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId;

      let progress = await ctx.db.userProgress.findUnique({
        where: {
          userId_entryId_targetLang: {
            userId,
            entryId: input.entryId,
            targetLang: input.targetLang,
          },
        },
        include: {
          entry: {
            include: {
              translations: {
                where: { lang: input.targetLang },
              },
            },
          },
        },
      });

      if (!progress) {
        progress = await ctx.db.userProgress.create({
          data: {
            userId,
            entryId: input.entryId,
            targetLang: input.targetLang,
            box: MIN_BOX,
            nextReviewAt: new Date(),
          },
          include: {
            entry: {
              include: {
                translations: {
                  where: { lang: input.targetLang },
                },
              },
            },
          },
        });
      }

      const translation = progress.entry.translations[0];
      if (!translation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No translation found for language: ${input.targetLang}`,
        });
      }

      const variants = Array.isArray(translation.variants)
        ? (translation.variants as string[])
        : [];

      const matchResult = matchAnswer({
        userAnswer: input.userAnswer,
        expected: translation.text,
        variants,
      });

      const boxBefore = progress.box;
      const boxAfter = matchResult.isCorrect
        ? nextBoxOnCorrect(progress.box)
        : nextBoxOnWrong();
      const nextReviewAt = scheduleNextReview(boxAfter);
      const answers = expectedAnswers(translation.text, variants);

      const updatedProgress = await ctx.db.userProgress.update({
        where: { id: progress.id },
        data: {
          box: boxAfter,
          nextReviewAt,
          correctCount: matchResult.isCorrect
            ? progress.correctCount + 1
            : progress.correctCount,
          wrongCount: matchResult.isCorrect
            ? progress.wrongCount
            : progress.wrongCount + 1,
          lastReviewedAt: new Date(),
        },
      });

      await ctx.db.reviewLog.create({
        data: {
          userProgressId: progress.id,
          targetLang: input.targetLang,
          userAnswer: input.userAnswer,
          expected: translation.text,
          isCorrect: matchResult.isCorrect,
          typo: matchResult.isTypo,
        },
      });

      return {
        // UI-compatible fields
        isCorrect: matchResult.isCorrect,
        expected: translation.text,
        typo: matchResult.isTypo,
        newBox: boxAfter,
        nextReviewAt,
        matchedVariant: matchResult.matchedVariant,
        correctCount: updatedProgress.correctCount,
        wrongCount: updatedProgress.wrongCount,
        // MCP / enriched fields
        correct: matchResult.isCorrect,
        boxBefore,
        boxAfter,
        expectedAnswers: answers,
      };
    }),

  /** Override a just-accepted correct answer as wrong (no second review log from empty submit). */
  markAsWrong: publicProcedure
    .input(
      z.object({
        entryId: z.string(),
        targetLang: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId;

      const progress = await ctx.db.userProgress.findUnique({
        where: {
          userId_entryId_targetLang: {
            userId,
            entryId: input.entryId,
            targetLang: input.targetLang,
          },
        },
        include: {
          entry: {
            include: {
              translations: {
                where: { lang: input.targetLang },
              },
            },
          },
          reviews: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      if (!progress) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Progress not found",
        });
      }

      const translation = progress.entry.translations[0];
      if (!translation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No translation found for language: ${input.targetLang}`,
        });
      }

      const boxBefore = progress.box;
      const boxAfter = nextBoxOnWrong();
      const nextReviewAt = scheduleNextReview(boxAfter);

      const lastReview = progress.reviews[0];
      const wasCorrect = lastReview?.isCorrect === true;

      const updatedProgress = await ctx.db.userProgress.update({
        where: { id: progress.id },
        data: {
          box: boxAfter,
          nextReviewAt,
          correctCount: wasCorrect
            ? Math.max(0, progress.correctCount - 1)
            : progress.correctCount,
          wrongCount: progress.wrongCount + (wasCorrect ? 1 : 0),
          lastReviewedAt: new Date(),
        },
      });

      if (lastReview && wasCorrect) {
        await ctx.db.reviewLog.update({
          where: { id: lastReview.id },
          data: { isCorrect: false, typo: false },
        });
      } else if (!lastReview) {
        await ctx.db.reviewLog.create({
          data: {
            userProgressId: progress.id,
            targetLang: input.targetLang,
            userAnswer: "",
            expected: translation.text,
            isCorrect: false,
            typo: false,
          },
        });
      }

      const variants = Array.isArray(translation.variants)
        ? (translation.variants as string[])
        : [];

      return {
        isCorrect: false as const,
        expected: translation.text,
        typo: false,
        newBox: boxAfter,
        nextReviewAt,
        correctCount: updatedProgress.correctCount,
        wrongCount: updatedProgress.wrongCount,
        maxBox: MAX_BOX,
        correct: false as const,
        boxBefore,
        boxAfter,
        expectedAnswers: expectedAnswers(translation.text, variants),
      };
    }),

  setBox: publicProcedure
    .input(
      z.object({
        entryId: z.string(),
        targetLang: z.string(),
        box: z.number().int().min(MIN_BOX).max(MAX_BOX),
        reschedule: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId;
      const nextReviewAt = input.reschedule
        ? scheduleNextReview(input.box)
        : undefined;

      const progress = await ctx.db.userProgress.upsert({
        where: {
          userId_entryId_targetLang: {
            userId,
            entryId: input.entryId,
            targetLang: input.targetLang,
          },
        },
        create: {
          userId,
          entryId: input.entryId,
          targetLang: input.targetLang,
          box: input.box,
          nextReviewAt: nextReviewAt ?? new Date(),
        },
        update: {
          box: input.box,
          ...(nextReviewAt ? { nextReviewAt } : {}),
        },
      });

      return {
        entryId: input.entryId,
        targetLang: input.targetLang,
        box: progress.box,
        nextReviewAt: progress.nextReviewAt,
      };
    }),

  getCardHistory: publicProcedure
    .input(
      z.object({
        entryId: z.string(),
        targetLang: z.string(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.userId;

      const progress = await ctx.db.userProgress.findUnique({
        where: {
          userId_entryId_targetLang: {
            userId,
            entryId: input.entryId,
            targetLang: input.targetLang,
          },
        },
        include: {
          entry: {
            select: {
              id: true,
              mainText: true,
              type: true,
              category: true,
            },
          },
          reviews: {
            orderBy: { createdAt: "desc" },
            take: input.limit,
          },
        },
      });

      if (!progress) {
        return {
          entryId: input.entryId,
          targetLang: input.targetLang,
          progress: null,
          reviews: [],
        };
      }

      return {
        entryId: input.entryId,
        targetLang: input.targetLang,
        entry: progress.entry,
        progress: {
          box: progress.box,
          nextReviewAt: progress.nextReviewAt,
          correctCount: progress.correctCount,
          wrongCount: progress.wrongCount,
          lastReviewedAt: progress.lastReviewedAt,
        },
        reviews: progress.reviews.map((r) => ({
          id: r.id,
          userAnswer: r.userAnswer,
          expected: r.expected,
          isCorrect: r.isCorrect,
          typo: r.typo,
          createdAt: r.createdAt,
        })),
      };
    }),

  getStats: publicProcedure
    .input(
      z.object({
        entryId: z.string(),
        targetLang: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.userId;

      const progress = await ctx.db.userProgress.findUnique({
        where: {
          userId_entryId_targetLang: {
            userId,
            entryId: input.entryId,
            targetLang: input.targetLang,
          },
        },
      });

      return progress;
    }),
});

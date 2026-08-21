import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { CardType, EntryType, WordCategory } from "@prisma/client";
import { matchAnswer } from "~/lib/matching";
import {
  MAX_BOX,
  MIN_BOX,
  VOCAB_CARD_KEY,
  applyLeitnerResult,
  nextBoxOnCorrect,
  nextBoxOnWrong,
  scheduleNextReview,
} from "~/lib/leitner";
import { TARGET_LANG_CODES } from "~/lib/languages";
import { db } from "~/server/db";
import { leechRecovered, recordActivity } from "~/server/gamification";

type DbClient = typeof db;

const VOCAB_CARD = { cardType: CardType.VOCAB, cardKey: VOCAB_CARD_KEY } as const;

function vocabProgressWhere(
  userId: string,
  entryId: string,
  targetLang: string,
) {
  return {
    userId_entryId_targetLang_cardKey: {
      userId,
      entryId,
      targetLang,
      cardKey: VOCAB_CARD_KEY,
    },
  };
}

type BoxCounts = Record<1 | 2 | 3 | 4 | 5 | 6, number>;

function emptyBoxCounts(): BoxCounts {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
}

function addBoxCount(counts: BoxCounts, box: number, amount: number) {
  if (box >= MIN_BOX && box <= MAX_BOX) {
    const key = box as keyof BoxCounts;
    counts[key] += amount;
  }
}

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

async function gradeAndUpdateProgress(
  prisma: DbClient,
  userId: string,
  entryId: string,
  targetLang: string,
  userAnswer: string,
  skipProgress = false,
) {
  let progress = await prisma.userProgress.findUnique({
    where: vocabProgressWhere(userId, entryId, targetLang),
    include: {
      entry: {
        include: {
          translations: {
            where: { lang: targetLang },
          },
        },
      },
    },
  });

  if (!progress && skipProgress) {
    const entry = await prisma.entry.findUnique({
      where: { id: entryId },
      include: { translations: { where: { lang: targetLang } } },
    });
    if (!entry?.translations[0]) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `No translation found for language: ${targetLang}`,
      });
    }
    const translation = entry.translations[0];
    const variants = Array.isArray(translation.variants)
      ? (translation.variants as string[])
      : [];
    const matchResult = matchAnswer({
      userAnswer,
      expected: translation.text,
      variants,
    });
    const answers = expectedAnswers(translation.text, variants);
    return {
      targetLang,
      isCorrect: matchResult.isCorrect,
      expected: translation.text,
      ipa: translation.ipa,
      typo: matchResult.isTypo,
      newBox: MIN_BOX,
      nextReviewAt: new Date(),
      matchedVariant: matchResult.matchedVariant,
      correctCount: 0,
      wrongCount: 0,
      correct: matchResult.isCorrect,
      boxBefore: MIN_BOX,
      boxAfter: MIN_BOX,
      expectedAnswers: answers,
      leechRecovered: false,
    };
  }

  if (!progress) {
    progress = await prisma.userProgress.create({
      data: {
        userId,
        entryId,
        targetLang,
        ...VOCAB_CARD,
        box: MIN_BOX,
        nextReviewAt: new Date(),
      },
      include: {
        entry: {
          include: {
            translations: {
              where: { lang: targetLang },
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
      message: `No translation found for language: ${targetLang}`,
    });
  }

  const variants = Array.isArray(translation.variants)
    ? (translation.variants as string[])
    : [];

  const matchResult = matchAnswer({
    userAnswer,
    expected: translation.text,
    variants,
  });

  const boxBefore = progress.box;
  const { boxAfter, nextReviewAt } = applyLeitnerResult(
    progress.box,
    matchResult.isCorrect,
  );
  const answers = expectedAnswers(translation.text, variants);

  if (skipProgress) {
    return {
      targetLang,
      isCorrect: matchResult.isCorrect,
      expected: translation.text,
      ipa: translation.ipa,
      typo: matchResult.isTypo,
      newBox: boxBefore,
      nextReviewAt: progress.nextReviewAt,
      matchedVariant: matchResult.matchedVariant,
      correctCount: progress.correctCount,
      wrongCount: progress.wrongCount,
      correct: matchResult.isCorrect,
      boxBefore,
      boxAfter: boxBefore,
      expectedAnswers: answers,
      leechRecovered: false,
    };
  }

  const updatedProgress = await prisma.userProgress.update({
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

  await prisma.reviewLog.create({
    data: {
      userProgressId: progress.id,
      targetLang,
      userAnswer,
      expected: translation.text,
      isCorrect: matchResult.isCorrect,
      typo: matchResult.isTypo,
    },
  });

  const recovered = leechRecovered({
    wrongCount: progress.wrongCount,
    correctCount: progress.correctCount,
    boxBefore,
    boxAfter,
  });

  return {
    targetLang,
    isCorrect: matchResult.isCorrect,
    expected: translation.text,
    ipa: translation.ipa,
    typo: matchResult.isTypo,
    newBox: boxAfter,
    nextReviewAt,
    matchedVariant: matchResult.matchedVariant,
    correctCount: updatedProgress.correctCount,
    wrongCount: updatedProgress.wrongCount,
    correct: matchResult.isCorrect,
    boxBefore,
    boxAfter,
    expectedAnswers: answers,
    leechRecovered: recovered,
  };
}

export const reviewRouter = createTRPCRouter({
  getDue: publicProcedure
    .input(
      z.object({
        targetLang: z.string(),
        domainIds: z.array(z.string()).optional(),
        limit: z.number().min(1).max(100).default(20),
        practice: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.userId;
      const now = new Date();
      const domainFilter = entryDomainFilter(input.domainIds);

      if (input.practice) {
        const entries = await ctx.db.entry.findMany({
          where: {
            ...(domainFilter || {}),
            translations: { some: { lang: input.targetLang } },
          },
          take: input.limit,
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          include: {
            translations: { where: { lang: input.targetLang } },
            domains: { include: { domain: true } },
          },
        });
        return {
          cards: entries.map((entry) => ({
            ...mapCardWithoutSolution({
              id: entry.id,
              box: MIN_BOX,
              correctCount: 0,
              wrongCount: 0,
              nextReviewAt: now,
              entry,
            }),
            translation: entry.translations[0],
          })),
          totalAvailable: entries.length,
          boxCounts: emptyBoxCounts(),
        };
      }

      const dueProgresses = await ctx.db.userProgress.findMany({
        where: {
          userId,
          targetLang: input.targetLang,
          cardType: CardType.VOCAB,
          nextReviewAt: { lte: now },
          ...(domainFilter ? { entry: domainFilter } : {}),
        },
        take: input.limit,
        orderBy: [{ nextReviewAt: "asc" }, { id: "asc" }],
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

      const allCards = dueProgresses;

      const totalDueCount = await ctx.db.userProgress.count({
        where: {
          userId,
          targetLang: input.targetLang,
          cardType: CardType.VOCAB,
          nextReviewAt: { lte: now },
          ...(domainFilter ? { entry: domainFilter } : {}),
        },
      });

      const dueByBox = await ctx.db.userProgress.groupBy({
        by: ["box"],
        where: {
          userId,
          targetLang: input.targetLang,
          cardType: CardType.VOCAB,
          nextReviewAt: { lte: now },
          ...(domainFilter ? { entry: domainFilter } : {}),
        },
        _count: { _all: true },
      });
      const boxCounts = emptyBoxCounts();
      for (const row of dueByBox) {
        addBoxCount(boxCounts, row.box, row._count._all);
      }

      return {
        cards: allCards.map((progress) => ({
          ...mapCardWithoutSolution(progress),
          // UI still needs translation after submit; MCP strips this
          translation: progress.entry.translations[0],
        })),
        totalAvailable: totalDueCount,
        boxCounts,
      };
    }),

  getDueMulti: publicProcedure
    .input(
      z.object({
        domainIds: z.array(z.string()).optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.userId;
      const now = new Date();
      const domainFilter = entryDomainFilter(input.domainIds);
      const targetLangs: string[] = [...TARGET_LANG_CODES];

      // Due progresses across all target languages, ordered by earliest due date
      const dueProgresses = await ctx.db.userProgress.findMany({
        where: {
          userId,
          targetLang: { in: targetLangs },
          cardType: CardType.VOCAB,
          nextReviewAt: { lte: now },
          ...(domainFilter ? { entry: domainFilter } : {}),
        },
        orderBy: [{ nextReviewAt: "asc" }, { id: "asc" }],
        select: {
          entryId: true,
          nextReviewAt: true,
          box: true,
        },
      });

      const entryOrder: string[] = [];
      const seen = new Set<string>();
      for (const p of dueProgresses) {
        if (!seen.has(p.entryId)) {
          seen.add(p.entryId);
          entryOrder.push(p.entryId);
        }
      }

      const totalAvailable = entryOrder.length;
      const batchIds = entryOrder.slice(0, input.limit);

      const boxCounts = emptyBoxCounts();
      const boxByEntry = new Map<string, number>();
      for (const progress of dueProgresses) {
        const prev = boxByEntry.get(progress.entryId);
        if (prev === undefined || progress.box < prev) {
          boxByEntry.set(progress.entryId, progress.box);
        }
      }
      for (const box of boxByEntry.values()) {
        addBoxCount(boxCounts, box, 1);
      }

      if (batchIds.length === 0) {
        return { cards: [], totalAvailable: 0, boxCounts };
      }

      const entries = await ctx.db.entry.findMany({
        where: { id: { in: batchIds } },
        include: {
          translations: {
            where: { lang: { in: targetLangs } },
          },
          progresses: {
            where: {
              userId,
              targetLang: { in: targetLangs },
              cardType: CardType.VOCAB,
            },
          },
          domains: {
            include: { domain: true },
          },
        },
      });

      const entryById = new Map(entries.map((e) => [e.id, e]));

      const cards = await Promise.all(
        batchIds.map(async (entryId) => {
          const entry = entryById.get(entryId);
          if (!entry) return null;

          // One translation per target lang (prefer first if region variants exist)
          const translationsByLang = new Map<string, (typeof entry.translations)[0]>();
          for (const tr of entry.translations) {
            if (!translationsByLang.has(tr.lang)) {
              translationsByLang.set(tr.lang, tr);
            }
          }

          const progressByLang = new Map(
            entry.progresses.map((p) => [p.targetLang, p])
          );

          const languages = await Promise.all(
            [...translationsByLang.keys()].map(async (lang) => {
              let progress = progressByLang.get(lang);
              if (!progress) {
                progress = await ctx.db.userProgress.create({
                  data: {
                    userId,
                    entryId: entry.id,
                    targetLang: lang,
                    ...VOCAB_CARD,
                    box: MIN_BOX,
                    nextReviewAt: now,
                  },
                });
              }
              return {
                targetLang: lang,
                box: progress.box,
              };
            })
          );

          // Stable order matching TARGET_LANG_CODES
          languages.sort(
            (a, b) =>
              targetLangs.indexOf(a.targetLang) -
              targetLangs.indexOf(b.targetLang)
          );

          return {
            entryId: entry.id,
            mainText: entry.mainText,
            type: entry.type,
            category: entry.category,
            note: entry.note,
            domains: entry.domains.map((d) => d.domain),
            languages,
          };
        })
      );

      return {
        cards: cards.filter((c): c is NonNullable<typeof c> => c !== null),
        totalAvailable,
        boxCounts,
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
          cardType: CardType.VOCAB,
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
                  cardType: CardType.VOCAB,
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
        skipProgress: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await gradeAndUpdateProgress(
        ctx.db,
        ctx.userId,
        input.entryId,
        input.targetLang,
        input.userAnswer,
        input.skipProgress,
      );
      if (input.skipProgress) {
        return { ...result, gamification: null };
      }
      const gamification = await recordActivity(ctx.db, ctx.userId, {
        items: [
          {
            targetLang: input.targetLang,
            isCorrect: result.isCorrect,
            isTypo: result.typo,
          },
        ],
        flags: { leechRecovered: result.leechRecovered },
      });
      return { ...result, gamification };
    }),

  submitMultiAnswers: publicProcedure
    .input(
      z.object({
        entryId: z.string(),
        answers: z
          .array(
            z.object({
              targetLang: z.string(),
              userAnswer: z.string(),
            })
          )
          .min(1),
        skipProgress: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const results = [];
      for (const answer of input.answers) {
        const result = await gradeAndUpdateProgress(
          ctx.db,
          ctx.userId,
          input.entryId,
          answer.targetLang,
          answer.userAnswer,
          input.skipProgress,
        );
        results.push(result);
      }
      if (input.skipProgress) {
        return { results, gamification: null };
      }
      const gamification = await recordActivity(ctx.db, ctx.userId, {
        items: results.map((result) => ({
          targetLang: result.targetLang,
          isCorrect: result.isCorrect,
          isTypo: result.typo,
        })),
        flags: {
          leechRecovered: results.some((result) => result.leechRecovered),
        },
      });
      return { results, gamification };
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
        where: vocabProgressWhere(userId, input.entryId, input.targetLang),
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

  /** Override a just-rejected wrong answer as correct (e.g. valid alternate wording). */
  markAsCorrect: publicProcedure
    .input(
      z.object({
        entryId: z.string(),
        targetLang: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId;

      const progress = await ctx.db.userProgress.findUnique({
        where: vocabProgressWhere(userId, input.entryId, input.targetLang),
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

      const lastReview = progress.reviews[0];
      const wasWrong = lastReview?.isCorrect === false;

      const boxBefore = progress.box;
      const boxAfter = wasWrong
        ? nextBoxOnCorrect(progress.box)
        : progress.box;
      const nextReviewAt = wasWrong
        ? scheduleNextReview(boxAfter)
        : progress.nextReviewAt;

      let variants = Array.isArray(translation.variants)
        ? (translation.variants as string[])
        : [];

      const userAnswer = lastReview?.userAnswer?.trim() ?? "";
      const shouldAddVariant =
        wasWrong &&
        userAnswer.length > 0 &&
        userAnswer !== translation.text &&
        !variants.includes(userAnswer);

      if (shouldAddVariant) {
        variants = [...variants, userAnswer];
        await ctx.db.translation.update({
          where: { id: translation.id },
          data: { variants },
        });
      }

      const updatedProgress = wasWrong
        ? await ctx.db.userProgress.update({
            where: { id: progress.id },
            data: {
              box: boxAfter,
              nextReviewAt,
              correctCount: progress.correctCount + 1,
              wrongCount: Math.max(0, progress.wrongCount - 1),
              lastReviewedAt: new Date(),
            },
          })
        : progress;

      if (lastReview && wasWrong) {
        await ctx.db.reviewLog.update({
          where: { id: lastReview.id },
          data: { isCorrect: true, typo: false },
        });
      }

      return {
        isCorrect: true as const,
        expected: translation.text,
        typo: false,
        newBox: boxAfter,
        nextReviewAt,
        correctCount: updatedProgress.correctCount,
        wrongCount: updatedProgress.wrongCount,
        maxBox: MAX_BOX,
        correct: true as const,
        boxBefore,
        boxAfter,
        expectedAnswers: expectedAnswers(translation.text, variants),
        addedVariant: shouldAddVariant ? userAnswer : null,
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
        where: vocabProgressWhere(userId, input.entryId, input.targetLang),
        create: {
          userId,
          entryId: input.entryId,
          targetLang: input.targetLang,
          ...VOCAB_CARD,
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
        where: vocabProgressWhere(userId, input.entryId, input.targetLang),
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
        where: vocabProgressWhere(userId, input.entryId, input.targetLang),
      });

      return progress;
    }),
});

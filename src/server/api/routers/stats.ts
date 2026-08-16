import { CardType } from "@prisma/client";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { LANGUAGE_NAMES, TARGET_LANG_CODES } from "~/lib/languages";

export const statsRouter = createTRPCRouter({
  dashboard: publicProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId;
    const now = new Date();

    const dueCount = await ctx.db.userProgress.count({
      where: {
        userId,
        cardType: CardType.VOCAB,
        nextReviewAt: { lte: now },
      },
    });

    const totalEntries = await ctx.db.entry.count();

    const topWrong = await ctx.db.userProgress.findMany({
      where: {
        userId,
        cardType: CardType.VOCAB,
        wrongCount: { gt: 0 },
      },
      orderBy: [{ wrongCount: "desc" }, { correctCount: "asc" }],
      take: 10,
      include: {
        entry: {
          include: {
            domains: {
              include: { domain: true },
              take: 1,
            },
            translations: {
              take: 1,
            },
          },
        },
      },
    });

    const problemCards = topWrong.map((progress) => {
      const totalReviews = progress.correctCount + progress.wrongCount;
      const successRate =
        totalReviews > 0 ? progress.correctCount / totalReviews : 0;
      const isLeech = progress.wrongCount >= 6 && successRate < 0.5;

      return {
        id: progress.id,
        entryId: progress.entryId,
        targetLang: progress.targetLang,
        mainText: progress.entry.mainText,
        type: progress.entry.type,
        domain: progress.entry.domains[0]?.domain.name,
        correctCount: progress.correctCount,
        wrongCount: progress.wrongCount,
        successRate: Math.round(successRate * 100),
        box: progress.box,
        isLeech,
        lastReviewedAt: progress.lastReviewedAt,
      };
    });

    const domainStats = await ctx.db.domain.findMany({
      include: {
        _count: {
          select: { domainEntries: true },
        },
      },
    });

    const wordCount = await ctx.db.entry.count({
      where: { type: "WORD" },
    });
    const proverbCount = await ctx.db.entry.count({
      where: { type: "PROVERB" },
    });

    const verbCount = await ctx.db.entry.count({
      where: { category: "VERB" },
    });
    const nounCount = await ctx.db.entry.count({
      where: { category: "NOUN" },
    });
    const adjectiveCount = await ctx.db.entry.count({
      where: { category: "ADJECTIVE" },
    });
    const proverbCategoryCount = await ctx.db.entry.count({
      where: { category: "PROVERB" },
    });

    const progresses = await ctx.db.userProgress.findMany({
      where: {
        userId,
        cardType: CardType.VOCAB,
        targetLang: { in: [...TARGET_LANG_CODES] },
      },
      select: {
        entryId: true,
        targetLang: true,
        box: true,
      },
    });

    const translations = await ctx.db.translation.findMany({
      where: {
        lang: { in: [...TARGET_LANG_CODES] },
      },
      select: {
        entryId: true,
        lang: true,
      },
    });

    const languageProgress = [...TARGET_LANG_CODES].map((lang) => {
      const boxes = [0, 1, 2, 3, 4, 5, 6].map(() => 0);
      const progressedEntryIds = new Set<string>();

      for (const progress of progresses) {
        if (progress.targetLang !== lang) continue;
        progressedEntryIds.add(progress.entryId);
        const box = progress.box;
        if (box >= 1 && box <= 6) {
          boxes[box] = (boxes[box] ?? 0) + 1;
        }
      }

      const entryIdsWithTranslation = new Set(
        translations.filter((t) => t.lang === lang).map((t) => t.entryId)
      );
      let newCount = 0;
      for (const entryId of entryIdsWithTranslation) {
        if (!progressedEntryIds.has(entryId)) newCount += 1;
      }
      boxes[0] = newCount;

      const total = boxes.reduce((sum, count) => sum + count, 0);
      const mastered = (boxes[4] ?? 0) + (boxes[5] ?? 0) + (boxes[6] ?? 0);
      const masteryPercentage =
        total > 0 ? Math.round((mastered / total) * 100) : 0;

      return {
        language: lang,
        languageName: LANGUAGE_NAMES[lang] ?? lang,
        boxes: {
          new: boxes[0] ?? 0,
          box1: boxes[1] ?? 0,
          box2: boxes[2] ?? 0,
          box3: boxes[3] ?? 0,
          box4: boxes[4] ?? 0,
          box5: boxes[5] ?? 0,
          box6: boxes[6] ?? 0,
        },
        total,
        mastered,
        masteryPercentage,
      };
    });

    return {
      dueCount,
      totalEntries,
      topWrong: problemCards,
      domainStats: domainStats.map((d) => ({
        name: d.name,
        count: d._count.domainEntries,
      })),
      wordCount,
      proverbCount,
      verbCount,
      nounCount,
      adjectiveCount,
      proverbCategoryCount,
      languageProgress,
    };
  }),
});

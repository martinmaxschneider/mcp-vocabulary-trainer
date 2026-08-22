import { z } from "zod";
import { CardType, WordCategory } from "@prisma/client";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { isValidTense } from "~/lib/conjugation-catalog";
import {
  isTargetLang,
  LANGUAGE_NAMES,
  TARGET_LANG_CODES,
} from "~/lib/languages";
import { conjugationCardKey } from "~/lib/leitner";
import { localDateString } from "~/lib/gamification-config";
import {
  buildVocabularyGrowth,
  type GrowthEvent,
} from "~/lib/vocabulary-growth";

type LeitnerBoxes = {
  new: number;
  box1: number;
  box2: number;
  box3: number;
  box4: number;
  box5: number;
  box6: number;
};

function summarizeLeitnerTrack(
  availableIds: Iterable<string>,
  progressed: Iterable<{ id: string; box: number }>,
) {
  const boxes = [0, 0, 0, 0, 0, 0, 0];
  const progressedIds = new Set<string>();

  for (const item of progressed) {
    progressedIds.add(item.id);
    if (item.box >= 1 && item.box <= 6) {
      boxes[item.box] = (boxes[item.box] ?? 0) + 1;
    }
  }

  let newCount = 0;
  for (const id of availableIds) {
    if (!progressedIds.has(id)) newCount += 1;
  }
  boxes[0] = newCount;

  const total = boxes.reduce((sum, count) => sum + count, 0);
  const mastered = (boxes[4] ?? 0) + (boxes[5] ?? 0) + (boxes[6] ?? 0);

  return {
    boxes: {
      new: boxes[0] ?? 0,
      box1: boxes[1] ?? 0,
      box2: boxes[2] ?? 0,
      box3: boxes[3] ?? 0,
      box4: boxes[4] ?? 0,
      box5: boxes[5] ?? 0,
      box6: boxes[6] ?? 0,
    } satisfies LeitnerBoxes,
    total,
    mastered,
    masteryPercentage: total > 0 ? Math.round((mastered / total) * 100) : 0,
  };
}

export const statsRouter = createTRPCRouter({
  dashboard: publicProcedure
    .input(
      z
        .object({
          targetLang: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
    const userId = ctx.userId;
    const now = new Date();
    const targetLang =
      input?.targetLang && isTargetLang(input.targetLang)
        ? input.targetLang
        : undefined;
    const langs = targetLang ? [targetLang] : [...TARGET_LANG_CODES];
    const hasTranslation = targetLang
      ? { translations: { some: { lang: targetLang } } }
      : {};

    const dueVocabCount = await ctx.db.userProgress.count({
      where: {
        userId,
        cardType: CardType.VOCAB,
        nextReviewAt: { lte: now },
        ...(targetLang ? { targetLang } : {}),
      },
    });
    const dueSatzCount = await ctx.db.satzProgress.count({
      where: {
        userId,
        nextReviewAt: { lte: now },
        ...(targetLang ? { targetLang } : {}),
        ...(targetLang
          ? { satz: { translations: { some: { lang: targetLang } } } }
          : {}),
      },
    });
    const dueConjCount = await ctx.db.userProgress.count({
      where: {
        userId,
        cardType: CardType.CONJUGATION,
        nextReviewAt: { lte: now },
        ...(targetLang ? { targetLang } : {}),
      },
    });
    const dueCount = dueVocabCount + dueSatzCount + dueConjCount;

    const totalVocab = await ctx.db.entry.count({
      where: hasTranslation,
    });
    const satzCount = await ctx.db.satz.count({
      where: targetLang
        ? { translations: { some: { lang: targetLang } } }
        : {},
    });
    const totalEntries = totalVocab + satzCount;

    const topWrong = await ctx.db.userProgress.findMany({
      where: {
        userId,
        cardType: CardType.VOCAB,
        wrongCount: { gt: 0 },
        ...(targetLang ? { targetLang } : {}),
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
          select: {
            domainEntries: {
              where: targetLang
                ? {
                    entry: {
                      translations: { some: { lang: targetLang } },
                    },
                  }
                : {},
            },
          },
        },
      },
    });

    const wordCount = await ctx.db.entry.count({
      where: { type: "WORD", ...hasTranslation },
    });
    const proverbCount = await ctx.db.entry.count({
      where: { type: "PROVERB", ...hasTranslation },
    });

    const verbCount = await ctx.db.entry.count({
      where: { category: "VERB", ...hasTranslation },
    });
    const nounCount = await ctx.db.entry.count({
      where: { category: "NOUN", ...hasTranslation },
    });
    const adjectiveCount = await ctx.db.entry.count({
      where: { category: "ADJECTIVE", ...hasTranslation },
    });
    const proverbCategoryCount = await ctx.db.entry.count({
      where: { category: "PROVERB", ...hasTranslation },
    });

    const progresses = await ctx.db.userProgress.findMany({
      where: {
        userId,
        targetLang: { in: langs },
      },
      select: {
        entryId: true,
        targetLang: true,
        box: true,
        cardType: true,
        cardKey: true,
      },
    });

    const translations = await ctx.db.translation.findMany({
      where: {
        lang: { in: langs },
      },
      select: {
        entryId: true,
        lang: true,
      },
    });

    const satzTranslations = await ctx.db.satzTranslation.findMany({
      where: {
        lang: { in: langs },
      },
      select: {
        satzId: true,
        lang: true,
      },
    });
    const satzProgresses = await ctx.db.satzProgress.findMany({
      where: {
        userId,
        targetLang: { in: langs },
      },
      select: {
        satzId: true,
        targetLang: true,
        box: true,
      },
    });

    const conjugationForms = await ctx.db.conjugationForm.findMany({
      where: {
        translation: {
          lang: { in: langs },
          entry: { category: WordCategory.VERB },
        },
      },
      select: {
        tenseKey: true,
        translation: {
          select: { entryId: true, lang: true },
        },
      },
    });

    const languageProgress = langs.map((lang) => {
      const vocabAvailable = translations
        .filter((t) => t.lang === lang)
        .map((t) => t.entryId);
      const vocabProgressed = progresses
        .filter((p) => p.targetLang === lang && p.cardType === CardType.VOCAB)
        .map((p) => ({ id: p.entryId, box: p.box }));

      const conjugationAvailable = new Set<string>();
      for (const form of conjugationForms) {
        if (form.translation.lang !== lang) continue;
        if (!isValidTense(lang, form.tenseKey)) continue;
        conjugationAvailable.add(
          `${form.translation.entryId}:${conjugationCardKey(form.tenseKey)}`,
        );
      }
      const conjugationProgressed = progresses
        .filter(
          (p) => p.targetLang === lang && p.cardType === CardType.CONJUGATION,
        )
        .map((p) => ({ id: `${p.entryId}:${p.cardKey}`, box: p.box }));

      const satzAvailable = [
        ...new Set(
          satzTranslations
            .filter((row) => row.lang === lang)
            .map((row) => row.satzId),
        ),
      ];
      const satzProgressed = satzProgresses
        .filter((row) => row.targetLang === lang)
        .map((row) => ({ id: row.satzId, box: row.box }));

      return {
        language: lang,
        languageName: LANGUAGE_NAMES[lang] ?? lang,
        vocab: summarizeLeitnerTrack(vocabAvailable, vocabProgressed),
        conjugations: summarizeLeitnerTrack(
          conjugationAvailable,
          conjugationProgressed,
        ),
        satze: summarizeLeitnerTrack(satzAvailable, satzProgressed),
      };
    });

    const conjugationCount = languageProgress.reduce(
      (sum, lang) => sum + lang.conjugations.total,
      0,
    );

    return {
      dueCount,
      dueVocabCount,
      dueSatzCount,
      dueConjCount,
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
      satzCount,
      conjugationCount,
      languageProgress,
    };
  }),

  vocabularyGrowth: publicProcedure
    .input(
      z
        .object({
          targetLang: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.userId;
      const targetLang =
        input?.targetLang && isTargetLang(input.targetLang)
          ? input.targetLang
          : undefined;
      const langs = targetLang ? [targetLang] : [...TARGET_LANG_CODES];

      const [
        userProgress,
        satzProgress,
        translations,
        satzTranslations,
        conjugationForms,
      ] = await Promise.all([
        ctx.db.userProgress.findMany({
          where: {
            userId,
            ...(targetLang ? { targetLang } : {}),
          },
          select: { createdAt: true, cardType: true },
        }),
        ctx.db.satzProgress.findMany({
          where: {
            userId,
            ...(targetLang ? { targetLang } : {}),
          },
          select: { createdAt: true },
        }),
        ctx.db.translation.findMany({
          where: { lang: { in: langs } },
          select: { createdAt: true, entryId: true, lang: true },
        }),
        ctx.db.satzTranslation.findMany({
          where: { lang: { in: langs } },
          select: { createdAt: true, satzId: true, lang: true },
        }),
        ctx.db.conjugationForm.findMany({
          where: {
            translation: {
              lang: { in: langs },
              entry: { category: WordCategory.VERB },
            },
          },
          select: {
            createdAt: true,
            tenseKey: true,
            translation: { select: { entryId: true, lang: true } },
          },
        }),
      ]);

      const progress: GrowthEvent[] = [
        ...userProgress.map((row) => ({
          createdAt: row.createdAt,
          kind:
            row.cardType === CardType.CONJUGATION
              ? ("conjugations" as const)
              : ("vocab" as const),
        })),
        ...satzProgress.map((row) => ({
          createdAt: row.createdAt,
          kind: "satze" as const,
        })),
      ];

      const catalog = catalogEventsFrom(
        translations,
        satzTranslations,
        conjugationForms,
      );

      return buildVocabularyGrowth(progress, catalog, localDateString());
    }),
});

function keepEarliest(map: Map<string, Date>, key: string, date: Date) {
  const previous = map.get(key);
  if (!previous || date < previous) map.set(key, date);
}

function catalogEventsFrom(
  translations: Array<{ createdAt: Date; entryId: string; lang: string }>,
  satzTranslations: Array<{ createdAt: Date; satzId: string; lang: string }>,
  conjugationForms: Array<{
    createdAt: Date;
    tenseKey: string;
    translation: { entryId: string; lang: string };
  }>,
): GrowthEvent[] {
  const vocab = new Map<string, Date>();
  const satze = new Map<string, Date>();
  const conjugations = new Map<string, Date>();

  for (const row of translations) {
    keepEarliest(vocab, `${row.lang}:${row.entryId}`, row.createdAt);
  }
  for (const row of satzTranslations) {
    keepEarliest(satze, `${row.lang}:${row.satzId}`, row.createdAt);
  }
  for (const row of conjugationForms) {
    if (!isValidTense(row.translation.lang, row.tenseKey)) continue;
    keepEarliest(
      conjugations,
      `${row.translation.lang}:${row.translation.entryId}:${conjugationCardKey(row.tenseKey)}`,
      row.createdAt,
    );
  }

  return [
    ...[...vocab.values()].map((createdAt) => ({
      createdAt,
      kind: "vocab" as const,
    })),
    ...[...satze.values()].map((createdAt) => ({
      createdAt,
      kind: "satze" as const,
    })),
    ...[...conjugations.values()].map((createdAt) => ({
      createdAt,
      kind: "conjugations" as const,
    })),
  ];
}

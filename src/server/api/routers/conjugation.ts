import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { CardType, WordCategory } from "@prisma/client";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  conjugationAnswerTargets,
  getAllConjugationProfiles,
  getConjugationProfile,
  groupFormsByTense,
  isConjugatableLang,
  isValidPersonIndex,
  isValidTense,
  personLabels,
  tenseLabel,
} from "~/lib/conjugation-catalog";
import {
  MAX_BOX,
  MIN_BOX,
  applyLeitnerResult,
  conjugationCardKey,
} from "~/lib/leitner";
import { matchAnswer } from "~/lib/matching";
import { upsertConjugationFormRows } from "~/server/services/conjugation-forms";
import { db } from "~/server/db";
import { isConjugationPro, recordActivity } from "~/server/gamification";

type DbClient = typeof db;

const formInputSchema = z.object({
  tenseKey: z.string().min(1),
  personIndex: z.number().int().min(0).max(20),
  form: z.string(),
});

type ConjBoxCounts = Record<1 | 2 | 3 | 4 | 5 | 6, number>;

function emptyConjBoxCounts(): ConjBoxCounts {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
}

function addConjBoxCount(counts: ConjBoxCounts, box: number) {
  if (box >= MIN_BOX && box <= MAX_BOX) {
    counts[box as keyof ConjBoxCounts] += 1;
  }
}

function boxCountsForRun(
  dueGroups: Array<{ entryId: string; tenseKey: string }>,
  unseenGroups: Array<{ entryId: string; tenseKey: string }>,
  laterGroups: Array<{ group: { entryId: string; tenseKey: string } }>,
  progressByIdentity: Map<string, { box: number }>,
): ConjBoxCounts {
  const counts = emptyConjBoxCounts();
  for (const group of unseenGroups) {
    addConjBoxCount(counts, MIN_BOX);
  }
  for (const group of dueGroups) {
    const progress = progressByIdentity.get(
      `${group.entryId}:${conjugationCardKey(group.tenseKey)}`,
    );
    addConjBoxCount(counts, progress?.box ?? MIN_BOX);
  }
  const remaining = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (remaining === 0) {
    for (const { group } of laterGroups) {
      const progress = progressByIdentity.get(
        `${group.entryId}:${conjugationCardKey(group.tenseKey)}`,
      );
      addConjBoxCount(counts, progress?.box ?? MIN_BOX);
    }
  }
  return counts;
}

type TenseReviewLog = {
  userAnswer: string;
  expected: string;
  isCorrect: boolean;
  typo: boolean;
};

async function upsertAndGradeTenseCard(
  prisma: DbClient,
  input: {
    userId: string;
    entryId: string;
    targetLang: string;
    tenseKey: string;
    tenseCorrect: boolean;
    logs: TenseReviewLog[];
  },
) {
  const cardKey = conjugationCardKey(input.tenseKey);
  let progress = await prisma.userProgress.findUnique({
    where: {
      userId_entryId_targetLang_cardKey: {
        userId: input.userId,
        entryId: input.entryId,
        targetLang: input.targetLang,
        cardKey,
      },
    },
  });

  if (!progress) {
    progress = await prisma.userProgress.create({
      data: {
        userId: input.userId,
        entryId: input.entryId,
        targetLang: input.targetLang,
        cardType: CardType.CONJUGATION,
        cardKey,
        box: MIN_BOX,
        nextReviewAt: new Date(),
      },
    });
  }

  const boxBefore = progress.box;
  const { boxAfter, nextReviewAt } = applyLeitnerResult(
    progress.box,
    input.tenseCorrect,
  );

  await prisma.userProgress.update({
    where: { id: progress.id },
    data: {
      box: boxAfter,
      nextReviewAt,
      correctCount: input.tenseCorrect
        ? progress.correctCount + 1
        : progress.correctCount,
      wrongCount: input.tenseCorrect
        ? progress.wrongCount
        : progress.wrongCount + 1,
      lastReviewedAt: new Date(),
    },
  });

  if (input.logs.length > 0) {
    await prisma.reviewLog.createMany({
      data: input.logs.map((log) => ({
        userProgressId: progress.id,
        targetLang: input.targetLang,
        userAnswer: log.userAnswer,
        expected: log.expected,
        isCorrect: log.isCorrect,
        typo: log.typo,
      })),
    });
  }

  return {
    tenseKey: input.tenseKey,
    tenseLabel: tenseLabel(input.targetLang, input.tenseKey),
    allCorrect: input.tenseCorrect,
    boxBefore,
    boxAfter,
    nextReviewAt,
  };
}

export const conjugationRouter = createTRPCRouter({
  getCatalog: publicProcedure
    .input(
      z
        .object({
          lang: z.string().optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      if (input?.lang) {
        const profile = getConjugationProfile(input.lang);
        if (!profile) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `No conjugation catalog for language: ${input.lang}`,
          });
        }
        return { profiles: [profile] };
      }
      return { profiles: getAllConjugationProfiles() };
    }),

  getForEntry: publicProcedure
    .input(
      z.object({
        entryId: z.string(),
        lang: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findUnique({
        where: { id: input.entryId },
        include: {
          translations: {
            where: input.lang ? { lang: input.lang } : undefined,
            include: {
              conjugationForms: {
                orderBy: [{ tenseKey: "asc" }, { personIndex: "asc" }],
              },
            },
          },
        },
      });

      if (!entry) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found" });
      }

      const byLang = entry.translations
        .filter((t) => isConjugatableLang(t.lang))
        .map((t) => {
          const profile = getConjugationProfile(t.lang)!;
          const forms = t.conjugationForms.map((f) => ({
            tenseKey: f.tenseKey,
            personIndex: f.personIndex,
            form: f.form,
          }));
          return {
            translationId: t.id,
            lang: t.lang,
            text: t.text,
            isIrregular: t.isIrregular,
            profile,
            forms,
            byTense: groupFormsByTense(t.lang, forms),
          };
        });

      return {
        entryId: entry.id,
        mainText: entry.mainText,
        category: entry.category,
        languages: byLang,
      };
    }),

  setIrregular: publicProcedure
    .input(
      z.object({
        translationId: z.string(),
        isIrregular: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const translation = await ctx.db.translation.findUnique({
        where: { id: input.translationId },
      });

      if (!translation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Translation not found",
        });
      }

      if (!isConjugatableLang(translation.lang)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Language ${translation.lang} has no conjugation catalog`,
        });
      }

      const updated = await ctx.db.translation.update({
        where: { id: input.translationId },
        data: { isIrregular: input.isIrregular },
      });

      return {
        translationId: updated.id,
        lang: updated.lang,
        isIrregular: updated.isIrregular,
      };
    }),

  upsertForms: publicProcedure
    .input(
      z.object({
        translationId: z.string(),
        forms: z.array(formInputSchema),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const translation = await ctx.db.translation.findUnique({
        where: { id: input.translationId },
      });

      if (!translation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Translation not found",
        });
      }

      if (!isConjugatableLang(translation.lang)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Language ${translation.lang} has no conjugation catalog`,
        });
      }

      for (const f of input.forms) {
        if (!isValidTense(translation.lang, f.tenseKey)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid tense "${f.tenseKey}" for ${translation.lang}`,
          });
        }
        if (!isValidPersonIndex(translation.lang, f.personIndex)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid person index ${f.personIndex} for ${translation.lang}`,
          });
        }
      }

      await upsertConjugationFormRows(
        ctx.db,
        input.translationId,
        input.forms
      );

      // Keep legacy JSON in sync for transition
      const allForms = await ctx.db.conjugationForm.findMany({
        where: { translationId: input.translationId },
      });
      const byTense = groupFormsByTense(
        translation.lang,
        allForms.map((f) => ({
          tenseKey: f.tenseKey,
          personIndex: f.personIndex,
          form: f.form,
        }))
      );
      await ctx.db.translation.update({
        where: { id: input.translationId },
        data: { conjugations: byTense },
      });

      return {
        translationId: input.translationId,
        lang: translation.lang,
        forms: allForms.map((f) => ({
          tenseKey: f.tenseKey,
          personIndex: f.personIndex,
          form: f.form,
        })),
        byTense,
      };
    }),

  getDrillCard: publicProcedure
    .input(
      z.object({
        targetLang: z.string(),
        domainIds: z.array(z.string()).optional(),
        tenseKeys: z.array(z.string()).optional(),
        onlyIrregular: z.boolean().optional(),
        /** single = one random form; paradigm = all persons for selected tenses of one verb */
        mode: z.enum(["single", "paradigm"]).default("single"),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!isConjugatableLang(input.targetLang)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No conjugation drill for language: ${input.targetLang}`,
        });
      }

      const profile = getConjugationProfile(input.targetLang)!;
      const allowedTenses =
        input.tenseKeys && input.tenseKeys.length > 0
          ? input.tenseKeys.filter((k) => isValidTense(input.targetLang, k))
          : profile.tenses.map((t) => t.key);

      if (allowedTenses.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No valid tenses selected",
        });
      }

      const tenseSort = new Map(
        profile.tenses.map((t) => [t.key, t.sortOrder]),
      );

      const forms = await ctx.db.conjugationForm.findMany({
        where: {
          tenseKey: { in: allowedTenses },
          translation: {
            lang: input.targetLang,
            ...(input.onlyIrregular ? { isIrregular: true } : {}),
            entry: {
              category: WordCategory.VERB,
              ...(input.domainIds &&
                input.domainIds.length > 0 && {
                  domains: {
                    some: { domainId: { in: input.domainIds } },
                  },
                }),
            },
          },
        },
        include: {
          translation: {
            include: {
              entry: true,
            },
          },
        },
        take: 2000,
      });

      if (forms.length === 0) {
        return {
          mode: input.mode,
          card: null,
          paradigm: null,
          totalAvailable: 0,
          dueCount: 0,
          boxCounts: emptyConjBoxCounts(),
        };
      }

      type FormRow = (typeof forms)[number];
      type TenseGroup = {
        key: string;
        entryId: string;
        translationId: string;
        tenseKey: string;
        forms: FormRow[];
      };

      const tenseGroups = new Map<string, TenseGroup>();
      for (const form of forms) {
        const key = `${form.translation.entryId}:${form.tenseKey}`;
        const existing = tenseGroups.get(key);
        if (existing) {
          existing.forms.push(form);
        } else {
          tenseGroups.set(key, {
            key,
            entryId: form.translation.entryId,
            translationId: form.translationId,
            tenseKey: form.tenseKey,
            forms: [form],
          });
        }
      }

      const entryIds = [...new Set(forms.map((f) => f.translation.entryId))];
      const cardKeys = allowedTenses.map((tenseKey) =>
        conjugationCardKey(tenseKey),
      );
      const now = new Date();
      const progresses = await ctx.db.userProgress.findMany({
        where: {
          userId: ctx.userId,
          targetLang: input.targetLang,
          cardType: CardType.CONJUGATION,
          entryId: { in: entryIds },
          cardKey: { in: cardKeys },
        },
        select: {
          entryId: true,
          cardKey: true,
          nextReviewAt: true,
          box: true,
        },
      });
      const progressByIdentity = new Map(
        progresses.map((p) => [`${p.entryId}:${p.cardKey}`, p]),
      );

      const dueGroups: TenseGroup[] = [];
      const unseenGroups: TenseGroup[] = [];
      const laterGroups: Array<{ group: TenseGroup; nextReviewAt: Date }> = [];

      for (const group of tenseGroups.values()) {
        const progress = progressByIdentity.get(
          `${group.entryId}:${conjugationCardKey(group.tenseKey)}`,
        );
        if (!progress) {
          unseenGroups.push(group);
        } else if (progress.nextReviewAt <= now) {
          dueGroups.push(group);
        } else {
          laterGroups.push({ group, nextReviewAt: progress.nextReviewAt });
        }
      }

      laterGroups.sort(
        (a, b) => a.nextReviewAt.getTime() - b.nextReviewAt.getTime(),
      );

      const pickFrom = (pool: TenseGroup[]) =>
        pool[Math.floor(Math.random() * pool.length)]!;

      const chosenGroup =
        dueGroups.length > 0
          ? pickFrom(dueGroups)
          : unseenGroups.length > 0
            ? pickFrom(unseenGroups)
            : (laterGroups[0]?.group ?? null);

      const dueCount = dueGroups.length;
      const boxCounts = boxCountsForRun(dueGroups, unseenGroups, laterGroups, progressByIdentity);

      if (input.mode === "single") {
        const source = chosenGroup?.forms ?? forms;
        const pick = source[Math.floor(Math.random() * source.length)]!;

        return {
          mode: "single" as const,
          totalAvailable: forms.length,
          dueCount,
          boxCounts,
          paradigm: null,
          card: {
            formId: pick.id,
            entryId: pick.translation.entryId,
            translationId: pick.translationId,
            mainText: pick.translation.entry.mainText,
            infinitive: pick.translation.text,
            lang: pick.translation.lang,
            isIrregular: pick.translation.isIrregular,
            tenseKey: pick.tenseKey,
            tenseLabel: tenseLabel(pick.translation.lang, pick.tenseKey),
            personIndex: pick.personIndex,
            personLabel:
              personLabels(pick.translation.lang)[pick.personIndex] ??
              `Person ${pick.personIndex + 1}`,
          },
        };
      }

      const group = chosenGroup?.forms ?? forms;
      const head = group[0]!;

      const slots = group
        .slice()
        .sort((a, b) => {
          const tenseDiff =
            (tenseSort.get(a.tenseKey) ?? 999) -
            (tenseSort.get(b.tenseKey) ?? 999);
          if (tenseDiff !== 0) return tenseDiff;
          return a.personIndex - b.personIndex;
        })
        .map((form) => ({
          formId: form.id,
          tenseKey: form.tenseKey,
          tenseLabel: tenseLabel(form.translation.lang, form.tenseKey),
          personIndex: form.personIndex,
          personLabel:
            personLabels(form.translation.lang)[form.personIndex] ??
            `Person ${form.personIndex + 1}`,
        }));

      return {
        mode: "paradigm" as const,
        totalAvailable: tenseGroups.size,
        dueCount,
        boxCounts,
        card: null,
        paradigm: {
          entryId: head.translation.entryId,
          translationId: head.translationId,
          mainText: head.translation.entry.mainText,
          infinitive: head.translation.text,
          lang: head.translation.lang,
          isIrregular: head.translation.isIrregular,
          slots,
        },
      };
    }),

  submitDrillAnswer: publicProcedure
    .input(
      z.object({
        formId: z.string(),
        answer: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const form = await ctx.db.conjugationForm.findUnique({
        where: { id: input.formId },
        include: {
          translation: {
            include: { entry: true },
          },
        },
      });

      if (!form) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conjugation form not found",
        });
      }

      const { expected, variants } = conjugationAnswerTargets(
        form.translation.lang,
        form.form,
      );
      const match = matchAnswer({
        userAnswer: input.answer,
        expected,
        variants,
      });

      const progress = await upsertAndGradeTenseCard(ctx.db, {
        userId: ctx.userId,
        entryId: form.translation.entryId,
        targetLang: form.translation.lang,
        tenseKey: form.tenseKey,
        tenseCorrect: match.isCorrect,
        logs: [
          {
            userAnswer: input.answer,
            expected,
            isCorrect: match.isCorrect,
            typo: match.isTypo,
          },
        ],
      });

      const conjugationPro = await isConjugationPro(
        ctx.db,
        ctx.userId,
        form.translation.entryId,
        form.translation.lang,
      );
      const gamification = await recordActivity(ctx.db, ctx.userId, {
        items: [
          {
            targetLang: form.translation.lang,
            isCorrect: match.isCorrect,
            isTypo: match.isTypo,
          },
        ],
        flags: { conjugationPro },
      });

      return {
        isCorrect: match.isCorrect,
        typo: match.isTypo,
        expected,
        mainText: form.translation.entry.mainText,
        tenseKey: form.tenseKey,
        tenseLabel: tenseLabel(form.translation.lang, form.tenseKey),
        personIndex: form.personIndex,
        personLabel:
          personLabels(form.translation.lang)[form.personIndex] ??
          `Person ${form.personIndex + 1}`,
        boxBefore: progress.boxBefore,
        boxAfter: progress.boxAfter,
        nextReviewAt: progress.nextReviewAt,
        gamification,
      };
    }),

  submitParadigmAnswers: publicProcedure
    .input(
      z.object({
        answers: z
          .array(
            z.object({
              formId: z.string(),
              answer: z.string(),
            }),
          )
          .min(1)
          .max(80),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const forms = await ctx.db.conjugationForm.findMany({
        where: { id: { in: input.answers.map((a) => a.formId) } },
        include: {
          translation: { select: { lang: true, entryId: true } },
        },
      });
      const byId = new Map(forms.map((f) => [f.id, f]));

      const results = input.answers.map((a) => {
        const form = byId.get(a.formId);
        if (!form) {
          return {
            formId: a.formId,
            isCorrect: false,
            typo: false,
            expected: "",
            missing: true as const,
            tenseKey: null as string | null,
            entryId: null as string | null,
            lang: null as string | null,
          };
        }
        const { expected, variants } = conjugationAnswerTargets(
          form.translation.lang,
          form.form,
        );
        const match = matchAnswer({
          userAnswer: a.answer,
          expected,
          variants,
        });
        return {
          formId: a.formId,
          isCorrect: match.isCorrect,
          typo: match.isTypo,
          expected,
          missing: false as const,
          tenseKey: form.tenseKey,
          entryId: form.translation.entryId,
          lang: form.translation.lang,
        };
      });

      const byTense = new Map<
        string,
        {
          entryId: string;
          targetLang: string;
          tenseKey: string;
          logs: TenseReviewLog[];
          allCorrect: boolean;
        }
      >();

      for (let i = 0; i < input.answers.length; i++) {
        const answer = input.answers[i]!;
        const result = results[i]!;
        if (!result.tenseKey || !result.entryId || !result.lang) continue;
        const key = `${result.entryId}:${result.tenseKey}`;
        const existing = byTense.get(key);
        const log: TenseReviewLog = {
          userAnswer: answer.answer,
          expected: result.expected,
          isCorrect: result.isCorrect,
          typo: result.typo,
        };
        if (existing) {
          existing.logs.push(log);
          existing.allCorrect = existing.allCorrect && result.isCorrect;
        } else {
          byTense.set(key, {
            entryId: result.entryId,
            targetLang: result.lang,
            tenseKey: result.tenseKey,
            logs: [log],
            allCorrect: result.isCorrect,
          });
        }
      }

      const tenseResults = [];
      for (const group of byTense.values()) {
        tenseResults.push(
          await upsertAndGradeTenseCard(ctx.db, {
            userId: ctx.userId,
            entryId: group.entryId,
            targetLang: group.targetLang,
            tenseKey: group.tenseKey,
            tenseCorrect: group.allCorrect,
            logs: group.logs,
          }),
        );
      }

      const correctCount = results.filter((r) => r.isCorrect).length;
      const firstGroup = [...byTense.values()][0];
      const conjugationPro = firstGroup
        ? await isConjugationPro(
            ctx.db,
            ctx.userId,
            firstGroup.entryId,
            firstGroup.targetLang,
          )
        : false;
      const gamification = await recordActivity(ctx.db, ctx.userId, {
        items: results
          .filter((result) => result.lang)
          .map((result) => ({
            targetLang: result.lang!,
            isCorrect: result.isCorrect,
            isTypo: result.typo,
          })),
        flags: { conjugationPro },
      });

      return {
        results: results.map(({ formId, isCorrect, typo, expected, missing }) => ({
          formId,
          isCorrect,
          typo,
          expected,
          missing,
        })),
        correctCount,
        totalCount: results.length,
        tenseResults,
        gamification,
      };
    }),
});

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { WordCategory } from "@prisma/client";
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
import { matchAnswer } from "~/lib/matching";
import { upsertConjugationFormRows } from "~/server/services/conjugation-forms";

const formInputSchema = z.object({
  tenseKey: z.string().min(1),
  personIndex: z.number().int().min(0).max(20),
  form: z.string(),
});

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
        };
      }

      if (input.mode === "single") {
        const pick = forms[Math.floor(Math.random() * forms.length)]!;

        return {
          mode: "single" as const,
          totalAvailable: forms.length,
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

      const byTranslation = new Map<string, typeof forms>();
      for (const form of forms) {
        const list = byTranslation.get(form.translationId) ?? [];
        list.push(form);
        byTranslation.set(form.translationId, list);
      }

      const translationIds = [...byTranslation.keys()];
      const pickId =
        translationIds[Math.floor(Math.random() * translationIds.length)]!;
      const group = byTranslation.get(pickId)!;
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
        totalAvailable: translationIds.length,
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
        include: { translation: { select: { lang: true } } },
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
        };
      });

      const correctCount = results.filter((r) => r.isCorrect).length;

      return {
        results,
        correctCount,
        totalCount: results.length,
      };
    }),
});

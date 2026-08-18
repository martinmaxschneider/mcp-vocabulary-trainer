import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  generateTranslations,
  generateVocabSuggestions,
  generateCategorySuggestions,
} from "~/server/services/openai";
import { getLanguageName, SOURCE_LANG } from "~/lib/languages";
import { createChatCompletion } from "~/server/services/openrouter";
import { WordCategory } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { isConjugatableLang } from "~/lib/conjugation-catalog";

export const assistRouter = createTRPCRouter({
  generateTranslations: publicProcedure
    .input(
      z.object({
        mainText: z.string().min(1),
        note: z.string().optional(),
        targetLangs: z.array(z.string()).min(1),
        category: z.string().optional(),
        sourceLang: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const translations = await generateTranslations({
        mainText: input.mainText,
        note: input.note,
        targetLangs: input.targetLangs,
        category: input.category,
        sourceLang: input.sourceLang ?? SOURCE_LANG.code,
      });

      return translations;
    }),

  generateVocabSuggestions: publicProcedure
    .input(
      z.object({
        domainName: z.string().min(1),
        maxCount: z.number().min(5).max(100).optional(),
        sourceLang: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const suggestions = await generateVocabSuggestions({
        domainName: input.domainName,
        maxCount: input.maxCount,
        sourceLang: input.sourceLang ?? SOURCE_LANG.code,
      });

      return suggestions;
    }),

  generateCategorySuggestions: publicProcedure
    .input(
      z
        .object({
          category: z.enum([
            "VERB",
            "NOUN",
            "ADJECTIVE",
            "PROVERB",
            "ADVERB",
            "PREPOSITION",
            "CONJUNCTION",
            "PRONOUN",
          ]),
          maxCount: z.number().min(5).max(100).optional(),
          sourceLang: z.string().optional(),
          /** Only for VERB: suggest verbs irregular in irregularTargetLang */
          onlyIrregular: z.boolean().optional(),
          /** Target language whose irregularity is requested (required if onlyIrregular) */
          irregularTargetLang: z.string().optional(),
        })
        .superRefine((val, ctx) => {
          if (!val.onlyIrregular) return;
          if (!val.irregularTargetLang) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "irregularTargetLang is required when onlyIrregular is true",
              path: ["irregularTargetLang"],
            });
            return;
          }
          if (!isConjugatableLang(val.irregularTargetLang)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `No conjugation catalog for language: ${val.irregularTargetLang}`,
              path: ["irregularTargetLang"],
            });
          }
        }),
    )
    .mutation(async ({ input, ctx }) => {
      if (input.onlyIrregular && input.category !== "VERB") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "onlyIrregular is only supported for VERB",
        });
      }

      const existingWords = await ctx.db.entry.findMany({
        where: { category: input.category },
        select: { mainText: true },
      });

      let existingIrregularWords: string[] = [];
      if (input.onlyIrregular && input.irregularTargetLang) {
        const irregularEntries = await ctx.db.entry.findMany({
          where: {
            category: WordCategory.VERB,
            translations: {
              some: {
                lang: input.irregularTargetLang,
                isIrregular: true,
              },
            },
          },
          select: { mainText: true },
        });
        existingIrregularWords = irregularEntries.map((e) => e.mainText);
      }

      const suggestions = await generateCategorySuggestions({
        category: input.category,
        existingWords: existingWords.map((w) => w.mainText),
        maxCount: input.maxCount,
        sourceLang: input.sourceLang ?? SOURCE_LANG.code,
        onlyIrregular: input.onlyIrregular,
        irregularTargetLang: input.irregularTargetLang,
        existingIrregularWords,
      });

      return suggestions;
    }),

  vocabChat: publicProcedure
    .input(
      z.object({
        sourceWord: z.string(),
        sourceLang: z.string().optional(),
        translation: z.string(),
        targetLang: z.string(),
        userQuestion: z.string().min(1),
        conversationHistory: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const sourceLang = input.sourceLang ?? SOURCE_LANG.code;
      const sourceLangName = getLanguageName(sourceLang);
      const targetLangName = getLanguageName(input.targetLang);

      const systemPrompt = `Du bist ein hilfreicher Sprachlehrer. Der Benutzer lernt gerade die Vokabel:
- ${sourceLangName}: "${input.sourceWord}"
- ${targetLangName}: "${input.translation}"

Beantworte Fragen zur Vokabel, ihrer Verwendung, Grammatik, Beispielsätzen, oder verwandten Wörtern. 
Sei präzise, hilfreich und ermutigend. 

WICHTIG: 
- Antworte auf ${sourceLangName} (Erklärungen)
- Aber alle Beispielsätze und Verwendungsbeispiele sollen in ${targetLangName} sein
- Wenn der Benutzer nach Beispielsätzen fragt, gib sie in ${targetLangName} mit ${sourceLangName}-Übersetzung`;

      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...(input.conversationHistory?.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })) ?? []),
        { role: "user" as const, content: input.userQuestion },
      ];

      const response = await createChatCompletion({
        messages,
        temperature: 0.7,
        max_tokens: 500,
      });

      const answer =
        response.choices[0]?.message?.content ??
        "Entschuldigung, ich konnte keine Antwort generieren.";

      return { answer };
    }),
});

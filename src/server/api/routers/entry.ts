import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { EntryType, WordCategory, type Prisma } from "@prisma/client";
import { conjugationsSchema } from "~/lib/schemas/translation";
import { SOURCE_LANG } from "~/lib/languages";
import { db } from "~/server/db";
import { syncConjugationFormsFromJson } from "~/server/services/conjugation-forms";

const translationInputSchema = z.object({
  lang: z.string(),
  regionTag: z.string().optional(),
  text: z.string().min(1),
  variants: z.array(z.string()).optional(),
  example: z.string().optional(),
  ipa: z.string().optional(),
  audioUrl: z.string().optional(),
  isIrregular: z.boolean().optional(),
  conjugations: conjugationsSchema,
});

export const createEntryInputSchema = z.object({
  type: z.nativeEnum(EntryType),
  category: z.nativeEnum(WordCategory).optional(),
  mainLang: z.string().default(SOURCE_LANG.code),
  mainText: z.string().min(1),
  note: z.string().optional(),
  domainId: z.string().optional(),
  domainIds: z.array(z.string()).optional(),
  translations: z.array(translationInputSchema).min(1),
});

const domainsInclude = {
  domains: {
    include: {
      domain: true,
    },
  },
} as const;

type DbClient = typeof db | Prisma.TransactionClient;

async function syncDomainEntries(
  client: DbClient,
  entryId: string,
  domainIds: string[]
) {
  await client.domainEntry.deleteMany({ where: { entryId } });
  if (domainIds.length > 0) {
    await client.domainEntry.createMany({
      data: domainIds.map((domainId) => ({ entryId, domainId })),
    });
  }
}

function resolveDomainIds(input: {
  domainId?: string;
  domainIds?: string[];
}): string[] {
  return [
    ...new Set([
      ...(input.domainIds ?? []),
      ...(input.domainId ? [input.domainId] : []),
    ]),
  ];
}

async function createEntryRecord(
  client: DbClient,
  input: z.infer<typeof createEntryInputSchema>
) {
  const domainIds = resolveDomainIds(input);

  const entry = await client.entry.create({
    data: {
      type: input.type,
      category: input.category,
      mainLang: input.mainLang ?? SOURCE_LANG.code,
      mainText: input.mainText,
      note: input.note,
      translations: {
        create: input.translations.map((t) => ({
          lang: t.lang,
          regionTag: t.regionTag,
          text: t.text,
          variants: t.variants ?? undefined,
          example: t.example,
          ipa: t.ipa,
          audioUrl: t.audioUrl,
          isIrregular: t.isIrregular ?? false,
          conjugations: t.conjugations ?? undefined,
        })),
      },
      ...(domainIds.length > 0 && {
        domains: {
          create: domainIds.map((domainId) => ({ domainId })),
        },
      }),
    },
    include: {
      translations: true,
      ...domainsInclude,
    },
  });

  for (const t of entry.translations) {
    if (t.conjugations) {
      await syncConjugationFormsFromJson(
        client,
        t.id,
        t.lang,
        t.conjugations
      );
    }
  }

  return entry;
}

export const entryRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z.object({
        domainId: z.string().optional(),
        type: z.nativeEnum(EntryType).optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const entries = await ctx.db.entry.findMany({
        where: {
          ...(input.domainId && {
            domains: {
              some: { domainId: input.domainId },
            },
          }),
          ...(input.type && { type: input.type }),
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: "desc" },
        include: {
          translations: true,
          ...domainsInclude,
        },
      });

      let nextCursor: typeof input.cursor | undefined = undefined;
      if (entries.length > input.limit) {
        const nextItem = entries.pop();
        nextCursor = nextItem?.id;
      }

      return {
        entries,
        nextCursor,
      };
    }),

  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const q = input.query.trim();
      const entries = await ctx.db.entry.findMany({
        where: {
          OR: [
            { mainText: { contains: q } },
            { translations: { some: { text: { contains: q } } } },
          ],
        },
        take: input.limit,
        orderBy: { updatedAt: "desc" },
        include: {
          translations: true,
          ...domainsInclude,
        },
      });

      return { entries, query: q };
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findUnique({
        where: { id: input.id },
        include: {
          translations: true,
          ...domainsInclude,
        },
      });

      return entry;
    }),

  listTranslationsMissingIpa: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
        lang: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const translations = await ctx.db.translation.findMany({
        where: {
          OR: [{ ipa: null }, { ipa: "" }],
          ...(input.lang ? { lang: input.lang } : {}),
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { id: "asc" },
        select: {
          id: true,
          lang: true,
          text: true,
          entryId: true,
          entry: {
            select: {
              mainText: true,
              category: true,
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (translations.length > input.limit) {
        const next = translations.pop();
        nextCursor = next?.id;
      }

      return {
        items: translations.map((t) => ({
          translationId: t.id,
          entryId: t.entryId,
          mainText: t.entry.mainText,
          category: t.entry.category,
          lang: t.lang,
          text: t.text,
        })),
        nextCursor,
      };
    }),

  updateTranslationsIpa: publicProcedure
    .input(
      z.object({
        updates: z
          .array(
            z.object({
              id: z.string(),
              ipa: z.string().min(1),
            })
          )
          .min(1)
          .max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let updated = 0;
      for (const { id, ipa } of input.updates) {
        const result = await ctx.db.translation.updateMany({
          where: { id },
          data: { ipa: ipa.trim() },
        });
        updated += result.count;
      }
      return { updated };
    }),

  createManual: publicProcedure
    .input(createEntryInputSchema)
    .mutation(async ({ ctx, input }) => {
      return createEntryRecord(ctx.db, input);
    }),

  createMany: publicProcedure
    .input(
      z.object({
        entries: z.array(createEntryInputSchema).min(1).max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const created = await ctx.db.$transaction(async (tx) => {
        const results = [];
        for (const entryInput of input.entries) {
          const entry = await createEntryRecord(tx, entryInput);
          results.push(entry);
        }
        return results;
      });

      return {
        createdCount: created.length,
        entries: created,
      };
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        mainText: z.string().min(1).optional(),
        note: z.string().optional(),
        category: z.nativeEnum(WordCategory).nullish(),
        domainId: z.string().optional(),
        domainIds: z.array(z.string()).optional(),
        translationsUpsert: z
          .array(
            translationInputSchema.extend({
              id: z.string().optional(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.entry.update({
        where: { id: input.id },
        data: {
          ...(input.mainText && { mainText: input.mainText }),
          ...(input.note !== undefined && { note: input.note }),
          ...(input.category !== undefined && { category: input.category }),
        },
      });

      if (input.domainIds !== undefined) {
        await syncDomainEntries(ctx.db, input.id, input.domainIds);
      } else if (input.domainId !== undefined) {
        await syncDomainEntries(
          ctx.db,
          input.id,
          input.domainId ? [input.domainId] : []
        );
      }

      if (input.translationsUpsert) {
        for (const translation of input.translationsUpsert) {
          if (translation.id) {
            await ctx.db.translation.update({
              where: { id: translation.id },
              data: {
                text: translation.text,
                regionTag: translation.regionTag,
                variants: translation.variants ?? undefined,
                example: translation.example,
                ...(translation.ipa !== undefined && { ipa: translation.ipa }),
                ...(translation.audioUrl !== undefined && {
                  audioUrl: translation.audioUrl,
                }),
                ...(translation.isIrregular !== undefined && {
                  isIrregular: translation.isIrregular,
                }),
                conjugations: translation.conjugations ?? undefined,
              },
            });
            if (translation.conjugations !== undefined) {
              await syncConjugationFormsFromJson(
                ctx.db,
                translation.id,
                translation.lang,
                translation.conjugations
              );
            }
          } else {
            const created = await ctx.db.translation.create({
              data: {
                entryId: input.id,
                lang: translation.lang,
                regionTag: translation.regionTag,
                text: translation.text,
                variants: translation.variants ?? undefined,
                example: translation.example,
                ...(translation.ipa !== undefined && { ipa: translation.ipa }),
                ...(translation.audioUrl !== undefined && {
                  audioUrl: translation.audioUrl,
                }),
                isIrregular: translation.isIrregular ?? false,
                conjugations: translation.conjugations ?? undefined,
              },
            });
            if (translation.conjugations) {
              await syncConjugationFormsFromJson(
                ctx.db,
                created.id,
                created.lang,
                translation.conjugations
              );
            }
          }
        }
      }

      return ctx.db.entry.findUnique({
        where: { id: input.id },
        include: {
          translations: true,
          ...domainsInclude,
        },
      });
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.entry.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  listByCategory: publicProcedure
    .input(
      z.object({
        category: z.nativeEnum(WordCategory),
        domainId: z.string().optional(),
        targetLang: z.string().optional(),
        onlyWithTranslation: z.boolean().default(false),
        sortBy: z.enum(["mainText", "translation", "createdAt"]).default("mainText"),
        sortDir: z.enum(["asc", "desc"]).default("asc"),
        limit: z.number().min(1).max(200).default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where = {
        category: input.category,
        ...(input.domainId && {
          domains: {
            some: {
              domainId: input.domainId,
            },
          },
        }),
        ...(input.onlyWithTranslation &&
          input.targetLang && {
            translations: {
              some: { lang: input.targetLang },
            },
          }),
      };

      // Nested translation sort needs an in-memory pass; other sorts use Prisma.
      if (input.sortBy === "translation") {
        if (!input.targetLang) {
          // Fall back to mainText when no target language is selected.
          const entries = await ctx.db.entry.findMany({
            where,
            take: input.limit + 1,
            cursor: input.cursor ? { id: input.cursor } : undefined,
            orderBy: [{ mainText: input.sortDir }, { id: "asc" }],
            include: {
              translations: true,
              ...domainsInclude,
            },
          });

          let nextCursor: string | undefined;
          if (entries.length > input.limit) {
            const next = entries.pop();
            nextCursor = next?.id;
          }
          return { entries, nextCursor };
        }

        const all = await ctx.db.entry.findMany({
          where,
          include: {
            translations: true,
            ...domainsInclude,
          },
        });

        const dir = input.sortDir === "asc" ? 1 : -1;
        all.sort((a, b) => {
          const aText =
            a.translations.find((t) => t.lang === input.targetLang)?.text ?? "";
          const bText =
            b.translations.find((t) => t.lang === input.targetLang)?.text ?? "";
          return aText.localeCompare(bText, "de", { sensitivity: "base" }) * dir;
        });

        let start = 0;
        if (input.cursor) {
          const idx = all.findIndex((e) => e.id === input.cursor);
          start = idx >= 0 ? idx + 1 : 0;
        }
        const page = all.slice(start, start + input.limit + 1);
        let nextCursor: string | undefined;
        if (page.length > input.limit) {
          const next = page.pop();
          nextCursor = next?.id;
        }
        return { entries: page, nextCursor };
      }

      const orderBy =
        input.sortBy === "createdAt"
          ? [{ createdAt: input.sortDir }, { id: "asc" as const }]
          : [{ mainText: input.sortDir }, { id: "asc" as const }];

      const entries = await ctx.db.entry.findMany({
        where,
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy,
        include: {
          translations: true,
          ...domainsInclude,
        },
      });

      let nextCursor: string | undefined;
      if (entries.length > input.limit) {
        const next = entries.pop();
        nextCursor = next?.id;
      }

      return { entries, nextCursor };
    }),

  assignDomains: publicProcedure
    .input(
      z.object({
        entryId: z.string(),
        domainIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await syncDomainEntries(ctx.db, input.entryId, input.domainIds);
      return { success: true };
    }),

  /** Add entries to a domain without removing other domain assignments. */
  assignEntriesToDomain: publicProcedure
    .input(
      z.object({
        domainId: z.string(),
        entryIds: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.domainEntry.findMany({
        where: {
          domainId: input.domainId,
          entryId: { in: input.entryIds },
        },
        select: { entryId: true },
      });
      const existingIds = new Set(existing.map((e) => e.entryId));
      const toCreate = input.entryIds.filter((id) => !existingIds.has(id));

      if (toCreate.length > 0) {
        await ctx.db.domainEntry.createMany({
          data: toCreate.map((entryId) => ({
            entryId,
            domainId: input.domainId,
          })),
        });
      }

      return {
        success: true,
        domainId: input.domainId,
        entryIds: input.entryIds,
        assignedCount: toCreate.length,
      };
    }),

  /** Remove domain assignments; entries themselves remain. */
  removeEntriesFromDomain: publicProcedure
    .input(
      z.object({
        domainId: z.string(),
        entryIds: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.domainEntry.deleteMany({
        where: {
          domainId: input.domainId,
          entryId: { in: input.entryIds },
        },
      });

      return {
        success: true,
        removedCount: result.count,
        domainId: input.domainId,
        entryIds: input.entryIds,
      };
    }),
});

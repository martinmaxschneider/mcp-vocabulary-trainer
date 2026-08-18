import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  AudioStatus,
  DomainKind,
  SatzPriority,
  SatzRegister,
  SatzSource,
  ShadowingStatus,
  type Prisma,
} from "@prisma/client";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { SOURCE_LANG } from "~/lib/languages";
import { db } from "~/server/db";
import {
  deleteSatzEmbedding,
  upsertSatzEmbedding,
} from "~/server/services/embeddings";
import { suggestAnswerQuestion } from "~/server/services/satz-question";

const SATZ_DOMAIN_KINDS: DomainKind[] = [DomainKind.THEME, DomainKind.SPECIAL];

export const satzTranslationInputSchema = z.object({
  lang: z.string().min(1),
  text: z.string().min(1),
  register: z.nativeEnum(SatzRegister).optional(),
  audioUrl: z.string().optional(),
  audioStatus: z.nativeEnum(AudioStatus).optional(),
});

export const createSatzInputSchema = z.object({
  mainLang: z.string().default(SOURCE_LANG.code),
  mainText: z.string().min(1),
  trigger: z.string().optional(),
  source: z.nativeEnum(SatzSource).optional(),
  priority: z.nativeEnum(SatzPriority).optional(),
  shadowingStatus: z.nativeEnum(ShadowingStatus).optional(),
  answerToId: z.string().optional(),
  domainId: z.string().optional(),
  domainIds: z.array(z.string()).optional(),
  linkedEntryIds: z.array(z.string()).optional(),
  grammarTopicIds: z.array(z.string()).optional(),
  translations: z.array(satzTranslationInputSchema).min(1),
});

const satzInclude = {
  translations: true,
  domains: { include: { domain: true } },
  linkedEntries: {
    include: {
      entry: {
        select: { id: true, mainText: true, type: true, category: true },
      },
    },
  },
  grammarTopics: {
    include: {
      grammarTopic: {
        select: { id: true, title: true, slug: true, targetLang: true },
      },
    },
  },
  answerTo: { select: { id: true, mainText: true } },
  answers: { select: { id: true, mainText: true } },
} as const;

type DbClient = typeof db | Prisma.TransactionClient;

function resolveIds(single?: string, many?: string[]): string[] {
  return [...new Set([...(many ?? []), ...(single ? [single] : [])])];
}

async function assertSatzDomainIds(client: DbClient, domainIds: string[]) {
  if (domainIds.length === 0) return;
  const domains = await client.domain.findMany({
    where: { id: { in: domainIds } },
    select: { id: true, kind: true, name: true },
  });
  if (domains.length !== domainIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "One or more domains were not found",
    });
  }
  const invalid = domains.filter((d) => !SATZ_DOMAIN_KINDS.includes(d.kind));
  if (invalid.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Sätze can only be assigned to THEME or SPECIAL domains (not: ${invalid.map((d) => d.name).join(", ")})`,
    });
  }
}

async function syncDomainSaetze(
  client: DbClient,
  satzId: string,
  domainIds: string[],
) {
  await assertSatzDomainIds(client, domainIds);
  await client.domainSatz.deleteMany({ where: { satzId } });
  if (domainIds.length > 0) {
    await client.domainSatz.createMany({
      data: domainIds.map((domainId) => ({ satzId, domainId })),
    });
  }
}

async function syncSatzEntries(
  client: DbClient,
  satzId: string,
  entryIds: string[],
) {
  const unique = [...new Set(entryIds)];
  if (unique.length > 0) {
    const count = await client.entry.count({ where: { id: { in: unique } } });
    if (count !== unique.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "One or more entries were not found",
      });
    }
  }
  await client.satzEntry.deleteMany({ where: { satzId } });
  if (unique.length > 0) {
    await client.satzEntry.createMany({
      data: unique.map((entryId) => ({ satzId, entryId })),
    });
  }
}

async function syncSatzGrammarTopics(
  client: DbClient,
  satzId: string,
  grammarTopicIds: string[],
) {
  const unique = [...new Set(grammarTopicIds)];
  if (unique.length > 0) {
    const count = await client.grammarTopic.count({
      where: { id: { in: unique } },
    });
    if (count !== unique.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "One or more grammar topics were not found",
      });
    }
  }
  await client.satzGrammarTopic.deleteMany({ where: { satzId } });
  if (unique.length > 0) {
    await client.satzGrammarTopic.createMany({
      data: unique.map((grammarTopicId) => ({ satzId, grammarTopicId })),
    });
  }
}

async function persistSatzEmbedding(satzId: string, mainText: string) {
  try {
    await upsertSatzEmbedding(satzId, mainText);
  } catch (error) {
    console.error("Satz embedding failed:", error);
  }
}

export const satzRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z
        .object({
          domainId: z.string().optional(),
          source: z.nativeEnum(SatzSource).optional(),
          priority: z.nativeEnum(SatzPriority).optional(),
          query: z.string().optional(),
          limit: z.number().min(1).max(200).default(50),
          cursor: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const query = input?.query?.trim();
      const where: Prisma.SatzWhereInput = {
        ...(input?.domainId && {
          domains: { some: { domainId: input.domainId } },
        }),
        ...(input?.source && { source: input.source }),
        ...(input?.priority && { priority: input.priority }),
        ...(query && {
          OR: [
            { mainText: { contains: query } },
            { trigger: { contains: query } },
            { translations: { some: { text: { contains: query } } } },
          ],
        }),
      };

      const items = await ctx.db.satz.findMany({
        where,
        take: (input?.limit ?? 50) + 1,
        cursor: input?.cursor ? { id: input.cursor } : undefined,
        orderBy: { updatedAt: "desc" },
        include: satzInclude,
      });

      let nextCursor: string | undefined;
      if (items.length > (input?.limit ?? 50)) {
        const next = items.pop();
        nextCursor = next?.id;
      }

      return { items, nextCursor };
    }),

  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const q = input.query.trim();
      const items = await ctx.db.satz.findMany({
        where: {
          OR: [
            { mainText: { contains: q } },
            { trigger: { contains: q } },
            { translations: { some: { text: { contains: q } } } },
          ],
        },
        take: input.limit,
        orderBy: { updatedAt: "desc" },
        include: satzInclude,
      });
      return { items, query: q };
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const satz = await ctx.db.satz.findUnique({
        where: { id: input.id },
        include: satzInclude,
      });
      if (!satz) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Satz not found" });
      }
      return satz;
    }),

  create: publicProcedure
    .input(createSatzInputSchema)
    .mutation(async ({ ctx, input }) => {
      const domainIds = resolveIds(input.domainId, input.domainIds);
      await assertSatzDomainIds(ctx.db, domainIds);
      if (input.answerToId) {
        const question = await ctx.db.satz.findUnique({
          where: { id: input.answerToId },
          select: { id: true },
        });
        if (!question) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "answerToId does not match an existing Satz",
          });
        }
      }

      const satz = await ctx.db.satz.create({
        data: {
          mainLang: input.mainLang ?? SOURCE_LANG.code,
          mainText: input.mainText.trim(),
          trigger: input.trigger?.trim() || null,
          source: input.source ?? SatzSource.PERSONAL,
          priority: input.priority ?? SatzPriority.OCCASIONAL,
          shadowingStatus: input.shadowingStatus ?? ShadowingStatus.NOT_STARTED,
          answerToId: input.answerToId,
          translations: {
            create: input.translations.map((t) => ({
              lang: t.lang,
              text: t.text.trim(),
              register: t.register ?? SatzRegister.INFORMAL,
              audioUrl: t.audioUrl,
              audioStatus: t.audioStatus ?? AudioStatus.NONE,
            })),
          },
          ...(domainIds.length > 0 && {
            domains: { create: domainIds.map((domainId) => ({ domainId })) },
          }),
          ...(input.linkedEntryIds &&
            input.linkedEntryIds.length > 0 && {
              linkedEntries: {
                create: [...new Set(input.linkedEntryIds)].map((entryId) => ({
                  entryId,
                })),
              },
            }),
          ...(input.grammarTopicIds &&
            input.grammarTopicIds.length > 0 && {
              grammarTopics: {
                create: [...new Set(input.grammarTopicIds)].map(
                  (grammarTopicId) => ({ grammarTopicId }),
                ),
              },
            }),
        },
        include: satzInclude,
      });

      await persistSatzEmbedding(satz.id, satz.mainText);
      return satz;
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        mainText: z.string().min(1).optional(),
        trigger: z.string().nullable().optional(),
        source: z.nativeEnum(SatzSource).optional(),
        priority: z.nativeEnum(SatzPriority).optional(),
        shadowingStatus: z.nativeEnum(ShadowingStatus).optional(),
        answerToId: z.string().nullable().optional(),
        domainIds: z.array(z.string()).optional(),
        linkedEntryIds: z.array(z.string()).optional(),
        grammarTopicIds: z.array(z.string()).optional(),
        translations: z.array(satzTranslationInputSchema).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.satz.findUnique({
        where: { id: input.id },
        select: { id: true, mainText: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Satz not found" });
      }
      if (input.answerToId === input.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A Satz cannot answer itself",
        });
      }
      if (input.answerToId) {
        const question = await ctx.db.satz.findUnique({
          where: { id: input.answerToId },
          select: { id: true },
        });
        if (!question) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "answerToId does not match an existing Satz",
          });
        }
      }

      await ctx.db.satz.update({
        where: { id: input.id },
        data: {
          ...(input.mainText && { mainText: input.mainText.trim() }),
          ...(input.trigger !== undefined && {
            trigger: input.trigger?.trim() || null,
          }),
          ...(input.source && { source: input.source }),
          ...(input.priority && { priority: input.priority }),
          ...(input.shadowingStatus && {
            shadowingStatus: input.shadowingStatus,
          }),
          ...(input.answerToId !== undefined && {
            answerToId: input.answerToId,
          }),
        },
      });

      if (input.domainIds) {
        await syncDomainSaetze(ctx.db, input.id, input.domainIds);
      }
      if (input.linkedEntryIds) {
        await syncSatzEntries(ctx.db, input.id, input.linkedEntryIds);
      }
      if (input.grammarTopicIds) {
        await syncSatzGrammarTopics(ctx.db, input.id, input.grammarTopicIds);
      }
      if (input.translations) {
        await ctx.db.satzTranslation.deleteMany({ where: { satzId: input.id } });
        if (input.translations.length > 0) {
          await ctx.db.satzTranslation.createMany({
            data: input.translations.map((t) => ({
              satzId: input.id,
              lang: t.lang,
              text: t.text.trim(),
              register: t.register ?? SatzRegister.INFORMAL,
              audioUrl: t.audioUrl,
              audioStatus: t.audioStatus ?? AudioStatus.NONE,
            })),
          });
        }
      }

      const mainText = input.mainText?.trim() ?? existing.mainText;
      if (input.mainText && input.mainText.trim() !== existing.mainText) {
        await persistSatzEmbedding(input.id, mainText);
      }

      return ctx.db.satz.findUniqueOrThrow({
        where: { id: input.id },
        include: satzInclude,
      });
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await deleteSatzEmbedding(input.id, ctx.db);
      await ctx.db.satz.delete({ where: { id: input.id } });
      return { success: true };
    }),

  assignDomains: publicProcedure
    .input(
      z.object({
        satzId: z.string(),
        domainIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await syncDomainSaetze(ctx.db, input.satzId, input.domainIds);
      return { success: true };
    }),

  assignEntries: publicProcedure
    .input(
      z.object({
        satzId: z.string(),
        entryIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await syncSatzEntries(ctx.db, input.satzId, input.entryIds);
      return { success: true };
    }),

  assignGrammarTopics: publicProcedure
    .input(
      z.object({
        satzId: z.string(),
        grammarTopicIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await syncSatzGrammarTopics(ctx.db, input.satzId, input.grammarTopicIds);
      return { success: true };
    }),

  suggestQuestion: publicProcedure
    .input(
      z.object({
        mainText: z.string().min(1),
        excludeId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return suggestAnswerQuestion(input);
    }),
});

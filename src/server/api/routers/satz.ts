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
  assessNewSatzSimilarity,
  backfillSatzEmbeddings,
  deleteSatzEmbedding,
  findSimilarSaetze,
  getSatzEmbeddingStatus,
  saveSatzEmbedding,
  upsertSatzEmbedding,
} from "~/server/services/embeddings";
import { MIN_BOX, MAX_BOX } from "~/lib/leitner";
import { analyzeSatzDrift } from "~/server/services/openai";
import { suggestAnswerQuestion } from "~/server/services/satz-question";
import {
  deleteAudioFiles,
  deleteMainAudioFiles,
  deleteSatzAudioFiles,
  backfillAudioDurations,
  getSatzAudioStatus,
  processRequestedAudio,
  requestSatzAudio,
} from "~/server/services/tts";

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
  allowSimilar: z.boolean().optional(),
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
  answerTo: {
    include: {
      translations: true,
    },
  },
  answers: { select: { id: true, mainText: true } },
  progresses: true,
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

async function satzBoxWhere(
  userId: string,
  input?: {
    box?: number;
    targetLang?: string;
  },
): Promise<Prisma.SatzWhereInput> {
  if (input?.box === undefined) return {};
  const targetLang = input.targetLang;
  if (!targetLang) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "targetLang is required when filtering by box",
    });
  }
  const includeUnseen = input.box === MIN_BOX;
  return {
    OR: [
      {
        progresses: {
          some: { userId, targetLang, box: input.box },
        },
      },
      ...(includeUnseen
        ? [
            {
              progresses: {
                none: { userId, targetLang },
              },
            },
          ]
        : []),
    ],
  };
}

export const satzRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z
        .object({
          domainId: z.string().optional(),
          ids: z.array(z.string()).optional(),
          source: z.nativeEnum(SatzSource).optional(),
          priority: z.nativeEnum(SatzPriority).optional(),
          shadowingStatus: z.nativeEnum(ShadowingStatus).optional(),
          box: z.number().int().min(MIN_BOX).max(MAX_BOX).optional(),
          targetLang: z.string().optional(),
          query: z.string().optional(),
          limit: z.number().min(1).max(200).default(50),
          cursor: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const query = input?.query?.trim();
      const boxFilter = await satzBoxWhere(ctx.userId, input);
      const where: Prisma.SatzWhereInput = {
        ...(input?.ids && input.ids.length > 0 && { id: { in: input.ids } }),
        ...(input?.domainId && {
          domains: { some: { domainId: input.domainId } },
        }),
        ...(input?.source && { source: input.source }),
        ...(input?.priority && { priority: input.priority }),
        ...(input?.shadowingStatus && {
          shadowingStatus: input.shadowingStatus,
        }),
        ...boxFilter,
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
      const { allowSimilar, ...fields } = input;
      const assessment = await assessNewSatzSimilarity({
        mainText: fields.mainText,
        allowSimilar,
      });
      if (assessment.blocked) {
        return {
          created: false as const,
          reason: "similar" as const,
          candidates: assessment.candidates,
        };
      }

      const domainIds = resolveIds(fields.domainId, fields.domainIds);
      await assertSatzDomainIds(ctx.db, domainIds);
      if (fields.answerToId) {
        const question = await ctx.db.satz.findUnique({
          where: { id: fields.answerToId },
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
          mainLang: fields.mainLang ?? SOURCE_LANG.code,
          mainText: fields.mainText.trim(),
          trigger: fields.trigger?.trim() || null,
          source: fields.source ?? SatzSource.PERSONAL,
          priority: fields.priority ?? SatzPriority.OCCASIONAL,
          shadowingStatus: fields.shadowingStatus ?? ShadowingStatus.NOT_STARTED,
          answerToId: fields.answerToId,
          translations: {
            create: fields.translations.map((t) => ({
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
          ...(fields.linkedEntryIds &&
            fields.linkedEntryIds.length > 0 && {
              linkedEntries: {
                create: [...new Set(fields.linkedEntryIds)].map((entryId) => ({
                  entryId,
                })),
              },
            }),
          ...(fields.grammarTopicIds &&
            fields.grammarTopicIds.length > 0 && {
              grammarTopics: {
                create: [...new Set(fields.grammarTopicIds)].map(
                  (grammarTopicId) => ({ grammarTopicId }),
                ),
              },
            }),
        },
        include: satzInclude,
      });

      try {
        await saveSatzEmbedding(satz.id, assessment.vector, assessment.textHash);
      } catch (error) {
        console.error("Satz embedding failed:", error);
        await persistSatzEmbedding(satz.id, satz.mainText);
      }
      return { created: true as const, satz };
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
        const previous = await ctx.db.satzTranslation.findMany({
          where: { satzId: input.id },
          select: { id: true, lang: true, text: true, register: true },
        });
        const incoming = input.translations.map((t) => ({
          lang: t.lang,
          text: t.text.trim(),
          register: t.register ?? SatzRegister.INFORMAL,
          audioUrl: t.audioUrl,
          audioStatus: t.audioStatus ?? AudioStatus.NONE,
        }));
        const incomingKey = (t: {
          lang: string;
          text: string;
          register: SatzRegister;
        }) => `${t.lang}:${t.register}:${t.text}`;
        const keepKeys = new Set(incoming.map(incomingKey));
        const stale = previous.filter((t) => !keepKeys.has(incomingKey(t)));
        if (stale.length > 0) {
          await deleteAudioFiles(stale.map((t) => t.id));
          await ctx.db.satzTranslation.deleteMany({
            where: { id: { in: stale.map((t) => t.id) } },
          });
        }
        const previousKeys = new Set(previous.map(incomingKey));
        const toCreate = incoming.filter((t) => !previousKeys.has(incomingKey(t)));
        if (toCreate.length > 0) {
          await ctx.db.satzTranslation.createMany({
            data: toCreate.map((t) => ({
              satzId: input.id,
              lang: t.lang,
              text: t.text,
              register: t.register,
              audioUrl: t.audioUrl,
              audioStatus: t.audioStatus,
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
      await deleteSatzAudioFiles(input.id, ctx.db);
      await deleteSatzEmbedding(input.id, ctx.db);
      await ctx.db.satz.delete({ where: { id: input.id } });
      return { success: true };
    }),

  deleteMany: publicProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const ids = [...new Set(input.ids)];
      const translations = await ctx.db.satzTranslation.findMany({
        where: { satzId: { in: ids } },
        select: { id: true },
      });
      await deleteAudioFiles(translations.map((row) => row.id));
      await deleteMainAudioFiles(ids);
      for (const id of ids) {
        await deleteSatzEmbedding(id, ctx.db);
      }
      const result = await ctx.db.satz.deleteMany({ where: { id: { in: ids } } });
      return { success: true, deleted: result.count };
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

  analyzeDrift: publicProcedure
    .input(z.object({ satzId: z.string(), targetLang: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const satz = await ctx.db.satz.findUnique({
        where: { id: input.satzId },
        include: { translations: { where: { lang: input.targetLang } } },
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

      const result = await analyzeSatzDrift({
        germanText: satz.mainText,
        translationText: translation.text,
        targetLang: input.targetLang,
      });

      return {
        ...result,
        translationId: translation.id,
        mainText: satz.mainText,
        translationText: translation.text,
      };
    }),

  applyDriftFix: publicProcedure
    .input(
      z.object({
        satzId: z.string(),
        side: z.enum(["SOURCE", "TRANSLATION"]),
        newText: z.string().min(1),
        translationId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const newText = input.newText.trim();
      const satz = await ctx.db.satz.findUnique({
        where: { id: input.satzId },
        select: { id: true, mainAudioStatus: true },
      });
      if (!satz) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Satz not found" });
      }

      if (input.side === "SOURCE") {
        // Altes Audio passt nicht mehr zum Text: Datei löschen und neu anfordern,
        // aber nur wenn für die Karte überhaupt Audio gewollt war.
        const regenerate = satz.mainAudioStatus !== AudioStatus.NONE;
        if (regenerate) {
          await deleteMainAudioFiles([input.satzId]);
        }
        await ctx.db.satz.update({
          where: { id: input.satzId },
          data: {
            mainText: newText,
            ...(regenerate && {
              mainAudioStatus: AudioStatus.REQUESTED,
              mainAudioUrl: null,
              mainAudioDurationMs: null,
            }),
          },
        });
        await persistSatzEmbedding(input.satzId, newText);
        return { success: true, audioRequested: regenerate };
      }

      if (!input.translationId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "translationId is required when side is TRANSLATION",
        });
      }
      const translation = await ctx.db.satzTranslation.findUnique({
        where: { id: input.translationId },
        select: { id: true, satzId: true, audioStatus: true },
      });
      if (!translation || translation.satzId !== input.satzId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Translation not found for this Satz",
        });
      }
      const regenerate = translation.audioStatus !== AudioStatus.NONE;
      if (regenerate) {
        await deleteAudioFiles([translation.id]);
      }
      await ctx.db.satzTranslation.update({
        where: { id: translation.id },
        data: {
          text: newText,
          ...(regenerate && {
            audioStatus: AudioStatus.REQUESTED,
            audioUrl: null,
            audioDurationMs: null,
          }),
        },
      });
      return { success: true, audioRequested: regenerate };
    }),

  requestAudio: publicProcedure
    .input(
      z.object({
        satzIds: z.array(z.string()).min(1),
        includeQuestions: z.boolean().optional(),
        langs: z.array(z.string()).optional(),
        includeMain: z.boolean().optional(),
        regenerate: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return requestSatzAudio(input);
    }),

  processAudio: publicProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(10).default(2),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      return processRequestedAudio(input?.limit ?? 2);
    }),

  audioStatus: publicProcedure
    .input(z.object({ satzIds: z.array(z.string()).optional() }).optional())
    .query(async ({ input }) => {
      return getSatzAudioStatus(input?.satzIds);
    }),

  markPracticed: publicProcedure
    .input(z.object({ satzIds: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.satz.updateMany({
        where: {
          id: { in: [...new Set(input.satzIds)] },
          shadowingStatus: ShadowingStatus.NOT_STARTED,
        },
        data: { shadowingStatus: ShadowingStatus.PRACTICING },
      });
      return { updated: result.count };
    }),

  setShadowingStatus: publicProcedure
    .input(
      z.object({
        id: z.string(),
        shadowingStatus: z.nativeEnum(ShadowingStatus),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const satz = await ctx.db.satz.update({
        where: { id: input.id },
        data: { shadowingStatus: input.shadowingStatus },
        include: satzInclude,
      });
      return satz;
    }),

  embeddingStatus: publicProcedure.query(async () => {
    return getSatzEmbeddingStatus();
  }),

  findSimilar: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(20).default(5),
      }),
    )
    .mutation(async ({ input }) => {
      const result = await findSimilarSaetze(input.query, { k: input.limit });
      return {
        query: input.query.trim(),
        candidates: result.candidates,
      };
    }),

  backfillEmbeddings: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .mutation(async ({ input }) => {
      return backfillSatzEmbeddings(input.limit);
    }),

  backfillAudioDuration: publicProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(500).default(200),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      return backfillAudioDurations(input?.limit ?? 200);
    }),
});

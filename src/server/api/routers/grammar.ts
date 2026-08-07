import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { GrammarBlockType, Prisma } from "@prisma/client";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const exampleRowSchema = z.object({
  native: z.string().min(1),
  target: z.string().min(1),
  note: z.string().optional(),
});

export const grammarBlockInputSchema = z
  .object({
    id: z.string().optional(),
    type: z.nativeEnum(GrammarBlockType),
    title: z.string().optional().nullable(),
    body: z.string().optional().nullable(),
    examples: z.array(exampleRowSchema).max(100).optional().nullable(),
    sortOrder: z.number().int().optional(),
  })
  .superRefine((block, ctx) => {
    if (block.type === GrammarBlockType.EXAMPLES) {
      if (!block.examples || block.examples.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "EXAMPLES blocks require at least one example row",
          path: ["examples"],
        });
      }
    } else if (!block.body?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${block.type} blocks require a body`,
        path: ["body"],
      });
    }
  });

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "slug must be lowercase kebab-case (a-z, 0-9, hyphens)",
  });

const topicMetaSchema = z.object({
  targetLang: z.string().min(1),
  category: z.string().min(1).max(64),
  slug: slugSchema,
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(500),
  keywords: z.array(z.string().min(1)).max(50).optional(),
  sortOrder: z.number().int().optional(),
});

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 120);
}

function normalizeKeywords(
  keywords: string[] | undefined,
): string[] | undefined {
  if (!keywords) return undefined;
  const cleaned = [
    ...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean)),
  ];
  return cleaned.length > 0 ? cleaned : undefined;
}

function toBlockWrite(
  block: z.infer<typeof grammarBlockInputSchema>,
  index: number,
) {
  const isExamples = block.type === GrammarBlockType.EXAMPLES;
  return {
    ...(block.id ? { id: block.id } : {}),
    type: block.type,
    title: block.title?.trim() || null,
    body: isExamples ? null : block.body?.trim() || null,
    examples: isExamples ? (block.examples ?? []) : Prisma.DbNull,
    sortOrder: block.sortOrder ?? index,
  };
}

const topicInclude = {
  blocks: {
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
  },
} satisfies Prisma.GrammarTopicInclude;

function mapTopic<T extends { keywords: Prisma.JsonValue }>(topic: T) {
  return {
    ...topic,
    keywords: (topic.keywords as string[] | null) ?? [],
  };
}

export const grammarRouter = createTRPCRouter({
  listByLang: publicProcedure
    .input(z.object({ targetLang: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const topics = await ctx.db.grammarTopic.findMany({
        where: { targetLang: input.targetLang },
        orderBy: [
          { category: "asc" },
          { sortOrder: "asc" },
          { title: "asc" },
        ],
        include: { _count: { select: { blocks: true } } },
      });

      return topics.map((t) => ({
        id: t.id,
        targetLang: t.targetLang,
        category: t.category,
        slug: t.slug,
        title: t.title,
        summary: t.summary,
        keywords: (t.keywords as string[] | null) ?? [],
        sortOrder: t.sortOrder,
        blockCount: t._count.blocks,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));
    }),

  search: publicProcedure
    .input(
      z.object({
        targetLang: z.string().min(1),
        query: z.string().min(1).max(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      const q = input.query.trim().toLowerCase();
      const topics = await ctx.db.grammarTopic.findMany({
        where: { targetLang: input.targetLang },
        orderBy: [
          { category: "asc" },
          { sortOrder: "asc" },
          { title: "asc" },
        ],
        include: { _count: { select: { blocks: true } } },
      });

      return topics
        .filter((t) => {
          const keywords = (t.keywords as string[] | null) ?? [];
          const haystack = [
            t.title,
            t.summary,
            t.slug,
            t.category,
            ...keywords,
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        })
        .map((t) => ({
          id: t.id,
          targetLang: t.targetLang,
          category: t.category,
          slug: t.slug,
          title: t.title,
          summary: t.summary,
          keywords: (t.keywords as string[] | null) ?? [],
          sortOrder: t.sortOrder,
          blockCount: t._count.blocks,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        }));
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const topic = await ctx.db.grammarTopic.findUnique({
        where: { id: input.id },
        include: topicInclude,
      });
      if (!topic) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Grammar topic ${input.id} not found`,
        });
      }
      return mapTopic(topic);
    }),

  getBySlug: publicProcedure
    .input(
      z.object({
        targetLang: z.string().min(1),
        slug: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const topic = await ctx.db.grammarTopic.findUnique({
        where: {
          targetLang_slug: {
            targetLang: input.targetLang,
            slug: input.slug,
          },
        },
        include: topicInclude,
      });
      if (!topic) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Grammar topic ${input.targetLang}/${input.slug} not found`,
        });
      }
      return mapTopic(topic);
    }),

  create: publicProcedure
    .input(
      topicMetaSchema
        .omit({ slug: true })
        .extend({
          slug: slugSchema.optional(),
          blocks: z.array(grammarBlockInputSchema).min(1).max(50),
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const slug = input.slug?.trim() || slugify(input.title);
      if (!slug) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not derive a slug from title",
        });
      }

      const keywords = normalizeKeywords(input.keywords);

      try {
        const topic = await ctx.db.grammarTopic.create({
          data: {
            targetLang: input.targetLang,
            category: input.category.trim().toLowerCase(),
            slug,
            title: input.title.trim(),
            summary: input.summary.trim(),
            keywords: keywords ?? Prisma.DbNull,
            sortOrder: input.sortOrder ?? 0,
            blocks: {
              create: input.blocks.map((b, i) => toBlockWrite(b, i)),
            },
          },
          include: topicInclude,
        });
        return mapTopic(topic);
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Grammar topic with slug "${slug}" already exists for ${input.targetLang}`,
          });
        }
        throw e;
      }
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        targetLang: z.string().min(1).optional(),
        category: z.string().min(1).max(64).optional(),
        slug: slugSchema.optional(),
        title: z.string().min(1).max(200).optional(),
        summary: z.string().min(1).max(500).optional(),
        keywords: z.array(z.string().min(1)).max(50).optional(),
        sortOrder: z.number().int().optional(),
        /** When provided, replaces all blocks */
        blocks: z.array(grammarBlockInputSchema).min(1).max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.grammarTopic.findUnique({
        where: { id: input.id },
      });
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Grammar topic ${input.id} not found`,
        });
      }

      try {
        const topic = await ctx.db.$transaction(async (tx) => {
          if (input.blocks) {
            await tx.grammarBlock.deleteMany({ where: { topicId: input.id } });
            await tx.grammarBlock.createMany({
              data: input.blocks.map((b, i) => {
                const data = toBlockWrite(b, i);
                return {
                  topicId: input.id,
                  type: data.type,
                  title: data.title,
                  body: data.body,
                  examples: data.examples,
                  sortOrder: data.sortOrder,
                  ...(data.id ? { id: data.id } : {}),
                };
              }),
            });
          }

          return tx.grammarTopic.update({
            where: { id: input.id },
            data: {
              ...(input.targetLang !== undefined && {
                targetLang: input.targetLang,
              }),
              ...(input.category !== undefined && {
                category: input.category.trim().toLowerCase(),
              }),
              ...(input.slug !== undefined && { slug: input.slug }),
              ...(input.title !== undefined && { title: input.title.trim() }),
              ...(input.summary !== undefined && {
                summary: input.summary.trim(),
              }),
              ...(input.keywords !== undefined && {
                keywords:
                  normalizeKeywords(input.keywords) ?? Prisma.DbNull,
              }),
              ...(input.sortOrder !== undefined && {
                sortOrder: input.sortOrder,
              }),
            },
            include: topicInclude,
          });
        });

        return mapTopic(topic);
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Grammar topic slug conflict for this language",
          });
        }
        throw e;
      }
    }),

  upsertBlocks: publicProcedure
    .input(
      z.object({
        topicId: z.string().min(1),
        blocks: z.array(grammarBlockInputSchema).min(1).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.grammarTopic.findUnique({
        where: { id: input.topicId },
        include: { blocks: true },
      });
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Grammar topic ${input.topicId} not found`,
        });
      }

      const maxSort = existing.blocks.reduce(
        (max, b) => Math.max(max, b.sortOrder),
        -1,
      );

      await ctx.db.$transaction(async (tx) => {
        let nextSort = maxSort + 1;
        for (const block of input.blocks) {
          if (block.id) {
            const found = existing.blocks.find((b) => b.id === block.id);
            if (!found) {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: `Grammar block ${block.id} not found on topic`,
              });
            }
            const data = toBlockWrite(block, found.sortOrder);
            await tx.grammarBlock.update({
              where: { id: block.id },
              data: {
                type: data.type,
                title: data.title,
                body: data.body,
                examples: data.examples,
                ...(block.sortOrder !== undefined && {
                  sortOrder: block.sortOrder,
                }),
              },
            });
          } else {
            const data = toBlockWrite(block, nextSort);
            await tx.grammarBlock.create({
              data: {
                topicId: input.topicId,
                type: data.type,
                title: data.title,
                body: data.body,
                examples: data.examples,
                sortOrder: data.sortOrder,
              },
            });
            nextSort += 1;
          }
        }
      });

      const topic = await ctx.db.grammarTopic.findUniqueOrThrow({
        where: { id: input.topicId },
        include: topicInclude,
      });
      return mapTopic(topic);
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await ctx.db.grammarTopic.delete({ where: { id: input.id } });
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Grammar topic ${input.id} not found`,
        });
      }
      return { success: true, id: input.id };
    }),

  deleteBlock: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await ctx.db.grammarBlock.delete({ where: { id: input.id } });
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Grammar block ${input.id} not found`,
        });
      }
      return { success: true, id: input.id };
    }),
});

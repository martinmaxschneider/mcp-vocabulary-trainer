import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { SOURCE_LANG } from "~/lib/languages";

export const pronunciationGuideItemInputSchema = z.object({
  symbol: z.string().min(1),
  approx: z.string().optional().nullable(),
  explanation: z.string().min(1),
  exampleWord: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export const pronunciationRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    const guides = await ctx.db.pronunciationGuide.findMany({
      orderBy: [{ nativeLang: "asc" }, { targetLang: "asc" }],
      include: {
        _count: { select: { items: true } },
      },
    });

    return guides.map((g) => ({
      id: g.id,
      nativeLang: g.nativeLang,
      targetLang: g.targetLang,
      itemCount: g._count.items,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    }));
  }),

  getByPair: publicProcedure
    .input(
      z.object({
        nativeLang: z.string().optional(),
        targetLang: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const nativeLang = input.nativeLang ?? SOURCE_LANG.code;
      return ctx.db.pronunciationGuide.findUnique({
        where: {
          nativeLang_targetLang: {
            nativeLang,
            targetLang: input.targetLang,
          },
        },
        include: {
          items: { orderBy: [{ sortOrder: "asc" }, { symbol: "asc" }] },
        },
      });
    }),

  getByPairs: publicProcedure
    .input(
      z.object({
        nativeLang: z.string().optional(),
        targetLangs: z.array(z.string()).min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const nativeLang = input.nativeLang ?? SOURCE_LANG.code;
      const guides = await ctx.db.pronunciationGuide.findMany({
        where: {
          nativeLang,
          targetLang: { in: input.targetLangs },
        },
        include: {
          items: { orderBy: [{ sortOrder: "asc" }, { symbol: "asc" }] },
        },
      });

      const byTarget = Object.fromEntries(
        guides.map((g) => [g.targetLang, g]),
      ) as Record<string, (typeof guides)[number] | undefined>;

      return {
        nativeLang,
        guides: input.targetLangs.map((targetLang) => ({
          targetLang,
          guide: byTarget[targetLang] ?? null,
        })),
      };
    }),

  upsertGuide: publicProcedure
    .input(
      z.object({
        nativeLang: z.string().default(SOURCE_LANG.code),
        targetLang: z.string().min(1),
        items: z.array(pronunciationGuideItemInputSchema).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const nativeLang = input.nativeLang || SOURCE_LANG.code;

      return ctx.db.$transaction(async (tx) => {
        const guide = await tx.pronunciationGuide.upsert({
          where: {
            nativeLang_targetLang: {
              nativeLang,
              targetLang: input.targetLang,
            },
          },
          create: {
            nativeLang,
            targetLang: input.targetLang,
          },
          update: {},
        });

        await tx.pronunciationGuideItem.deleteMany({
          where: { guideId: guide.id },
        });

        if (input.items.length > 0) {
          await tx.pronunciationGuideItem.createMany({
            data: input.items.map((item, index) => ({
              guideId: guide.id,
              symbol: item.symbol.trim(),
              approx: item.approx?.trim() || null,
              explanation: item.explanation.trim(),
              exampleWord: item.exampleWord?.trim() || null,
              sortOrder: item.sortOrder ?? index,
            })),
          });
        }

        return tx.pronunciationGuide.findUniqueOrThrow({
          where: { id: guide.id },
          include: {
            items: { orderBy: [{ sortOrder: "asc" }, { symbol: "asc" }] },
          },
        });
      });
    }),

  upsertItems: publicProcedure
    .input(
      z.object({
        nativeLang: z.string().default(SOURCE_LANG.code),
        targetLang: z.string().min(1),
        items: z
          .array(pronunciationGuideItemInputSchema)
          .min(1)
          .max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const nativeLang = input.nativeLang || SOURCE_LANG.code;

      return ctx.db.$transaction(async (tx) => {
        const guide = await tx.pronunciationGuide.upsert({
          where: {
            nativeLang_targetLang: {
              nativeLang,
              targetLang: input.targetLang,
            },
          },
          create: {
            nativeLang,
            targetLang: input.targetLang,
          },
          update: {},
        });

        for (const [index, item] of input.items.entries()) {
          const symbol = item.symbol.trim();
          await tx.pronunciationGuideItem.upsert({
            where: {
              guideId_symbol: {
                guideId: guide.id,
                symbol,
              },
            },
            create: {
              guideId: guide.id,
              symbol,
              approx: item.approx?.trim() || null,
              explanation: item.explanation.trim(),
              exampleWord: item.exampleWord?.trim() || null,
              sortOrder: item.sortOrder ?? index,
            },
            update: {
              approx: item.approx?.trim() || null,
              explanation: item.explanation.trim(),
              exampleWord: item.exampleWord?.trim() || null,
              ...(item.sortOrder !== undefined && {
                sortOrder: item.sortOrder,
              }),
            },
          });
        }

        return tx.pronunciationGuide.findUniqueOrThrow({
          where: { id: guide.id },
          include: {
            items: { orderBy: [{ sortOrder: "asc" }, { symbol: "asc" }] },
          },
        });
      });
    }),

  deleteGuide: publicProcedure
    .input(
      z.object({
        nativeLang: z.string().optional(),
        targetLang: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const nativeLang = input.nativeLang ?? SOURCE_LANG.code;
      try {
        await ctx.db.pronunciationGuide.delete({
          where: {
            nativeLang_targetLang: {
              nativeLang,
              targetLang: input.targetLang,
            },
          },
        });
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No pronunciation guide for ${nativeLang}→${input.targetLang}`,
        });
      }
      return { success: true, nativeLang, targetLang: input.targetLang };
    }),

  deleteItem: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await ctx.db.pronunciationGuideItem.delete({
          where: { id: input.id },
        });
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Pronunciation guide item ${input.id} not found`,
        });
      }
      return { success: true };
    }),
});

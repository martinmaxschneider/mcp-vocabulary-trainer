import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const domainRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z
        .object({
          targetLang: z.string().default("en"),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const targetLang = input?.targetLang ?? "en";
      const userId = ctx.userId;
      const now = new Date();

      const domains = await ctx.db.domain.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: { domainEntries: true },
          },
        },
      });

      const results = await Promise.all(
        domains.map(async (domain) => {
          const domainFilter = {
            domains: { some: { domainId: domain.id } },
          };

          const dueCount = await ctx.db.userProgress.count({
            where: {
              userId,
              targetLang,
              nextReviewAt: { lte: now },
              entry: domainFilter,
            },
          });

          const newCount = await ctx.db.entry.count({
            where: {
              ...domainFilter,
              translations: { some: { lang: targetLang } },
              progresses: {
                none: { userId, targetLang },
              },
            },
          });

          return {
            id: domain.id,
            name: domain.name,
            createdAt: domain.createdAt,
            updatedAt: domain.updatedAt,
            entryCount: domain._count.domainEntries,
            dueCount,
            newCount,
          };
        })
      );

      return results;
    }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required").max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.domain.findUnique({
        where: { name: input.name },
      });

      if (existing) {
        return { created: false as const, domain: existing };
      }

      const domain = await ctx.db.domain.create({
        data: { name: input.name },
      });

      return { created: true as const, domain };
    }),

  rename: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1, "Name is required").max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const clash = await ctx.db.domain.findFirst({
        where: {
          name: input.name,
          NOT: { id: input.id },
        },
      });

      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Domain with name "${input.name}" already exists`,
        });
      }

      const domain = await ctx.db.domain.update({
        where: { id: input.id },
        data: { name: input.name },
      });

      return domain;
    }),

  remove: publicProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.domain.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
});

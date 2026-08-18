import { z } from "zod";
import { CardType, DomainKind, WordCategory } from "@prisma/client";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { ensureCanonicalDomainsOnce } from "~/server/services/domains";

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
      await ensureCanonicalDomainsOnce(ctx.db);
      const targetLang = input?.targetLang ?? "en";
      const userId = ctx.userId;
      const now = new Date();

      const [domains, verbGroups] = await Promise.all([
        ctx.db.domain.findMany({
          orderBy: { name: "asc" },
          include: {
            _count: {
              select: {
                domainEntries: true,
                domainSaetze: true,
              },
            },
          },
        }),
        ctx.db.domainEntry.groupBy({
          by: ["domainId"],
          where: { entry: { category: WordCategory.VERB } },
          _count: { _all: true },
        }),
      ]);

      const verbCountByDomain = new Map(
        verbGroups.map((group) => [group.domainId, group._count._all]),
      );

      const results = await Promise.all(
        domains.map(async (domain) => {
          const domainFilter = {
            domains: { some: { domainId: domain.id } },
          };

          const dueCount = await ctx.db.userProgress.count({
            where: {
              userId,
              targetLang,
              cardType: CardType.VOCAB,
              nextReviewAt: { lte: now },
              entry: domainFilter,
            },
          });

          const newCount = await ctx.db.entry.count({
            where: {
              ...domainFilter,
              translations: { some: { lang: targetLang } },
              progresses: {
                none: { userId, targetLang, cardType: CardType.VOCAB },
              },
            },
          });

          const entryCount = domain._count.domainEntries;
          const verbCount = verbCountByDomain.get(domain.id) ?? 0;

          return {
            id: domain.id,
            name: domain.name,
            kind: domain.kind,
            createdAt: domain.createdAt,
            updatedAt: domain.updatedAt,
            entryCount,
            wordCount: entryCount - verbCount,
            verbCount,
            satzCount: domain._count.domainSaetze,
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
        kind: z.nativeEnum(DomainKind).optional(),
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
        data: {
          name: input.name,
          kind: input.kind ?? DomainKind.THEME,
        },
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

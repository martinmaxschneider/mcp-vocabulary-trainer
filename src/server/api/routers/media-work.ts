import { z } from "zod";
import { MediaKind } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { MEDIA_KINDS } from "~/lib/media-work";
import { ensureMediaWork } from "~/server/services/media-work";

const mediaKindSchema = z.nativeEnum(MediaKind);

const ensureInputSchema = z.object({
  kind: mediaKindSchema,
  title: z.string().min(1),
  creator: z.string().nullable().optional(),
  year: z.number().int().min(1000).max(2100).nullable().optional(),
  url: z.string().nullable().optional(),
});

export const mediaWorkRouter = createTRPCRouter({
  kinds: publicProcedure.query(() => [...MEDIA_KINDS]),

  list: publicProcedure
    .input(
      z
        .object({
          query: z.string().optional(),
          kind: mediaKindSchema.optional(),
          limit: z.number().min(1).max(100).default(30),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const query = input?.query?.trim();
      const items = await ctx.db.mediaWork.findMany({
        where: {
          ...(input?.kind && { kind: input.kind }),
          ...(query && {
            OR: [
              { title: { contains: query } },
              { creator: { contains: query } },
            ],
          }),
        },
        orderBy: [{ kind: "asc" }, { title: "asc" }],
        take: input?.limit ?? 30,
        include: { _count: { select: { saetze: true } } },
      });
      return { items };
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const work = await ctx.db.mediaWork.findUnique({
        where: { id: input.id },
        include: { _count: { select: { saetze: true } } },
      });
      if (!work) {
        throw new TRPCError({ code: "NOT_FOUND", message: "MEDIA_WORK_NOT_FOUND" });
      }
      return work;
    }),

  ensure: publicProcedure.input(ensureInputSchema).mutation(async ({ input }) => {
    try {
      return await ensureMediaWork(input);
    } catch (error) {
      if (error instanceof Error && error.message === "MEDIA_WORK_TITLE_REQUIRED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "MEDIA_WORK_TITLE_REQUIRED",
        });
      }
      throw error;
    }
  }),
});

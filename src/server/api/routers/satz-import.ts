import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { SatzPriority, SatzRegister, SatzSource } from "@prisma/client";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { satzTranslationInputSchema } from "~/server/api/routers/satz";
import {
  commitImportBatch,
  createBatchFromCsv,
  enrichNextDrafts,
  getBatchView,
  updateImportDraft,
} from "~/server/services/satz-import";

function asTrpcError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "CSV_EMPTY") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "CSV_EMPTY" });
  }
  if (message === "CSV_TOO_LARGE" || message === "CSV_TOO_MANY_ROWS") {
    throw new TRPCError({ code: "BAD_REQUEST", message });
  }
  if (message === "Satz import batch not found") {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Satz import batch not found",
    });
  }
  if (message === "Satz import draft not found") {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Satz import draft not found",
    });
  }
  if (
    message === "Satz import batch already committed" ||
    message === "Satz import draft already committed"
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message });
  }
  if (message === "SATZ_IMPORT_NOTHING_TO_COMMIT") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "SATZ_IMPORT_NOTHING_TO_COMMIT",
    });
  }
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

export const satzImportRouter = createTRPCRouter({
  listBatches: publicProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(50).default(20),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.satzImportBatch.findMany({
        take: input?.limit ?? 20,
        orderBy: { updatedAt: "desc" },
        include: {
          _count: { select: { items: true } },
        },
      });
      return { items };
    }),

  getBatch: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      try {
        return await getBatchView(input.id);
      } catch (error) {
        asTrpcError(error);
      }
    }),

  uploadCsv: publicProcedure
    .input(
      z.object({
        csvText: z.string().min(1),
        filename: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const batch = await createBatchFromCsv(input);
        return getBatchView(batch.id);
      } catch (error) {
        asTrpcError(error);
      }
    }),

  enrichNext: publicProcedure
    .input(
      z.object({
        batchId: z.string(),
        limit: z.number().min(1).max(10).default(2),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const result = await enrichNextDrafts(input.batchId, input.limit);
        const batch = await getBatchView(input.batchId);
        return { ...result, batch };
      } catch (error) {
        asTrpcError(error);
      }
    }),

  updateDraft: publicProcedure
    .input(
      z.object({
        id: z.string(),
        mainText: z.string().optional(),
        skip: z.boolean().optional(),
        allowSimilar: z.boolean().optional(),
        trigger: z.string().nullable().optional(),
        source: z.nativeEnum(SatzSource).optional(),
        priority: z.nativeEnum(SatzPriority).optional(),
        register: z.nativeEnum(SatzRegister).optional(),
        translations: z.array(satzTranslationInputSchema).optional(),
        domainIds: z.array(z.string()).optional(),
        linkedEntryIds: z.array(z.string()).optional(),
        isAnswer: z.boolean().optional(),
        answerToId: z.string().nullable().optional(),
        suggestedQuestionText: z.string().nullable().optional(),
        questionTranslations: z.array(satzTranslationInputSchema).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const { id, translations, questionTranslations, ...data } = input;
        await updateImportDraft(id, {
          ...data,
          translations: translations?.map((t) => ({
            lang: t.lang,
            text: t.text,
            register: t.register ?? SatzRegister.INFORMAL,
          })),
          questionTranslations: questionTranslations?.map((t) => ({
            lang: t.lang,
            text: t.text,
            register: t.register ?? SatzRegister.INFORMAL,
          })),
        });
        return { success: true };
      } catch (error) {
        asTrpcError(error);
      }
    }),

  commit: publicProcedure
    .input(
      z.object({
        batchId: z.string(),
        draftIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const result = await commitImportBatch(input.batchId, input.draftIds);
        const batch = await getBatchView(input.batchId);
        return { ...result, batch };
      } catch (error) {
        asTrpcError(error);
      }
    }),

  deleteBatch: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.satzImportBatch.findUnique({
        where: { id: input.id },
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Satz import batch not found",
        });
      }
      await ctx.db.satzImportBatch.delete({ where: { id: input.id } });
      return { success: true };
    }),
});

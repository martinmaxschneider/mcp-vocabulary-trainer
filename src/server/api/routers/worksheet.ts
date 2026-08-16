import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  Prisma,
  type PrismaClient,
  WorksheetQuestionType,
  WorksheetStatus,
} from "@prisma/client";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  countClozeBlanks,
  worksheetCreateInputSchema,
  worksheetUpdateInputSchema,
  worksheetUserAnswerSchema,
  type WorksheetQuestionInput,
  type WorksheetUserAnswer,
} from "~/lib/schemas/worksheet";
import {
  computeDisplayScore,
  gradeQuestion,
  isAnswerCorrect,
} from "~/lib/worksheet-grading";
import { recordActivity } from "~/server/gamification";

const questionInclude = {
  answer: true,
  grammarTopic: { select: { id: true, title: true, slug: true } },
  entry: { select: { id: true, mainText: true, category: true } },
} satisfies Prisma.WorksheetQuestionInclude;

const worksheetInclude = {
  questions: {
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
    include: questionInclude,
  },
} satisfies Prisma.WorksheetInclude;

type QuestionWithAnswer = Prisma.WorksheetQuestionGetPayload<{
  include: typeof questionInclude;
}>;

function asTags(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function validateQuestionShape(question: WorksheetQuestionInput) {
  if (question.type === WorksheetQuestionType.CLOZE) {
    const blanks = countClozeBlanks(question.payload.text);
    if (blanks !== question.accepted.blanks.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `CLOZE text has ${blanks} blank(s) but accepted.blanks has ${question.accepted.blanks.length}`,
      });
    }
  }
  if (question.type === WorksheetQuestionType.SENTENCE_REORDER) {
    if (question.payload.tokens.length !== question.accepted.order.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "SENTENCE_REORDER tokens and accepted.order must have the same length",
      });
    }
  }
  if (question.type === WorksheetQuestionType.MATCHING) {
    if (
      question.payload.left.length !== question.payload.right.length ||
      question.payload.left.length !== question.accepted.pairs.length
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "MATCHING left, right, and accepted.pairs must have the same length",
      });
    }
  }
  if (question.type === WorksheetQuestionType.CONJUGATION_GRID) {
    const persons = new Set(question.payload.persons);
    const cellPersons = new Set(
      question.accepted.cells.map((cell) => cell.personIndex),
    );
    if (persons.size !== cellPersons.size) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "CONJUGATION_GRID persons must match accepted.cells",
      });
    }
    for (const person of persons) {
      if (!cellPersons.has(person)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `CONJUGATION_GRID missing accepted cell for person ${person}`,
        });
      }
    }
  }
}

function toQuestionWrite(question: WorksheetQuestionInput, index: number) {
  validateQuestionShape(question);
  return {
    ...(question.id ? { id: question.id } : {}),
    type: question.type,
    categoryLabel: question.categoryLabel?.trim() || null,
    prompt: question.prompt.trim(),
    hint: question.hint?.trim() || null,
    points: question.points ?? 1,
    payload: question.payload ?? {},
    accepted: question.accepted,
    explanation: question.explanation?.trim() || null,
    grammarTopicId: question.grammarTopicId ?? null,
    entryId: question.entryId ?? null,
    tags: question.tags ?? Prisma.DbNull,
    sortOrder: question.sortOrder ?? index,
  };
}

function mapAnswer(answer: QuestionWithAnswer["answer"]) {
  if (!answer) return null;
  return {
    id: answer.id,
    userAnswer: answer.userAnswer,
    autoCorrect: answer.autoCorrect,
    isTypo: answer.isTypo,
    manualOverride: answer.manualOverride,
    isCorrect: isAnswerCorrect(answer),
    checkedAt: answer.checkedAt,
    overriddenAt: answer.overriddenAt,
  };
}

function mapQuestion(
  question: QuestionWithAnswer,
  opts: { hideSolution: boolean },
) {
  const answered = Boolean(question.answer);
  const hide = opts.hideSolution && !answered;
  return {
    id: question.id,
    sortOrder: question.sortOrder,
    type: question.type,
    categoryLabel: question.categoryLabel,
    prompt: question.prompt,
    hint: question.hint,
    points: question.points,
    payload: question.payload,
    accepted: hide ? undefined : question.accepted,
    explanation: hide ? undefined : question.explanation,
    grammarTopicId: question.grammarTopicId,
    grammarTopic: question.grammarTopic,
    entryId: question.entryId,
    entry: question.entry,
    tags: asTags(question.tags),
    answer: mapAnswer(question.answer),
  };
}

function scoreFromQuestions(params: {
  questions: Array<{ points: number; answer: QuestionWithAnswer["answer"] }>;
  maxScore: number | null;
}) {
  const totalPoints = params.questions.reduce((sum, q) => sum + q.points, 0);
  const earnedPoints = params.questions.reduce((sum, q) => {
    if (!q.answer) return sum;
    return isAnswerCorrect(q.answer) ? sum + q.points : sum;
  }, 0);
  const answeredCount = params.questions.filter((q) => q.answer).length;
  const correctCount = params.questions.filter(
    (q) => q.answer && isAnswerCorrect(q.answer),
  ).length;
  const display = computeDisplayScore({
    earnedPoints,
    totalPoints,
    maxScore: params.maxScore,
  });
  return {
    earnedPoints,
    totalPoints,
    answeredCount,
    correctCount,
    questionCount: params.questions.length,
    score: display.score,
    max: display.max,
  };
}

function mapWorksheet(
  worksheet: Prisma.WorksheetGetPayload<{ include: typeof worksheetInclude }>,
  opts: { hideSolution: boolean },
) {
  const questions = worksheet.questions.map((q) =>
    mapQuestion(q, opts),
  );
  return {
    id: worksheet.id,
    targetLang: worksheet.targetLang,
    title: worksheet.title,
    description: worksheet.description,
    section: worksheet.section,
    maxScore: worksheet.maxScore,
    status: worksheet.status,
    startedAt: worksheet.startedAt,
    completedAt: worksheet.completedAt,
    createdAt: worksheet.createdAt,
    updatedAt: worksheet.updatedAt,
    questions,
    analysis: buildAnalysis(worksheet.questions),
    ...scoreFromQuestions({
      questions: worksheet.questions,
      maxScore: worksheet.maxScore,
    }),
  };
}

function buildAnalysis(
  questions: QuestionWithAnswer[],
) {
  const byType: Record<string, { total: number; wrong: number }> = {};
  const byTag: Record<string, { total: number; wrong: number }> = {};
  const weakGrammarTopics: Array<{ id: string; title: string; slug: string }> =
    [];
  const weakEntries: Array<{ id: string; mainText: string }> = [];
  const seenTopics = new Set<string>();
  const seenEntries = new Set<string>();

  for (const question of questions) {
    if (!question.answer) continue;
    const wrong = !isAnswerCorrect(question.answer);
    const typeKey = question.type;
    byType[typeKey] ??= { total: 0, wrong: 0 };
    byType[typeKey].total += 1;
    if (wrong) byType[typeKey].wrong += 1;

    for (const tag of asTags(question.tags)) {
      byTag[tag] ??= { total: 0, wrong: 0 };
      byTag[tag].total += 1;
      if (wrong) byTag[tag].wrong += 1;
    }

    if (wrong && question.grammarTopic && !seenTopics.has(question.grammarTopic.id)) {
      seenTopics.add(question.grammarTopic.id);
      weakGrammarTopics.push(question.grammarTopic);
    }
    if (wrong && question.entry && !seenEntries.has(question.entry.id)) {
      seenEntries.add(question.entry.id);
      weakEntries.push({
        id: question.entry.id,
        mainText: question.entry.mainText,
      });
    }
  }

  return { byType, byTag, weakGrammarTopics, weakEntries };
}

async function loadWorksheet(client: PrismaClient, id: string) {
  const worksheet = await client.worksheet.findUnique({
    where: { id },
    include: worksheetInclude,
  });
  if (!worksheet) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Worksheet ${id} not found`,
    });
  }
  return worksheet;
}

async function submitOne(params: {
  db: Prisma.TransactionClient;
  question: QuestionWithAnswer;
  userAnswer: WorksheetUserAnswer;
}) {
  if (params.question.answer) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Question ${params.question.id} already answered`,
    });
  }
  if (params.userAnswer.type !== params.question.type) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Answer type ${params.userAnswer.type} does not match question type ${params.question.type}`,
    });
  }

  const grade = gradeQuestion({
    type: params.question.type,
    payload: params.question.payload,
    accepted: params.question.accepted,
    userAnswer: params.userAnswer,
  });

  const answer = await params.db.worksheetAnswer.create({
    data: {
      questionId: params.question.id,
      userAnswer: params.userAnswer,
      autoCorrect: grade.autoCorrect,
      isTypo: grade.isTypo,
    },
  });

  return { grade, answer };
}

async function syncWorksheetStatus(
  db: Prisma.TransactionClient,
  worksheetId: string,
  now: Date,
) {
  const worksheet = await db.worksheet.findUniqueOrThrow({
    where: { id: worksheetId },
    include: {
      questions: { include: { answer: true } },
    },
  });

  const answeredCount = worksheet.questions.filter((q) => q.answer).length;
  const allAnswered =
    worksheet.questions.length > 0 &&
    answeredCount === worksheet.questions.length;

  let status = worksheet.status;
  let startedAt = worksheet.startedAt;
  let completedAt = worksheet.completedAt;

  if (answeredCount > 0 && status === WorksheetStatus.OPEN) {
    status = WorksheetStatus.IN_PROGRESS;
    startedAt = startedAt ?? now;
  }
  if (allAnswered && status !== WorksheetStatus.COMPLETED) {
    status = WorksheetStatus.COMPLETED;
    completedAt = now;
  }

  if (
    status !== worksheet.status ||
    startedAt !== worksheet.startedAt ||
    completedAt !== worksheet.completedAt
  ) {
    await db.worksheet.update({
      where: { id: worksheetId },
      data: { status, startedAt, completedAt },
    });
  }
}

export const worksheetRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z
        .object({
          targetLang: z.string().min(1).optional(),
          status: z.nativeEnum(WorksheetStatus).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const worksheets = await ctx.db.worksheet.findMany({
        where: {
          ...(input?.targetLang ? { targetLang: input.targetLang } : {}),
          ...(input?.status ? { status: input.status } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          questions: {
            include: { answer: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      });

      return worksheets.map((ws) => {
        const scoring = scoreFromQuestions({
          questions: ws.questions,
          maxScore: ws.maxScore,
        });
        return {
          id: ws.id,
          targetLang: ws.targetLang,
          title: ws.title,
          description: ws.description,
          section: ws.section,
          maxScore: ws.maxScore,
          status: ws.status,
          startedAt: ws.startedAt,
          completedAt: ws.completedAt,
          createdAt: ws.createdAt,
          updatedAt: ws.updatedAt,
          ...scoring,
        };
      });
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const worksheet = await loadWorksheet(ctx.db, input.id);
      return mapWorksheet(worksheet, { hideSolution: false });
    }),

  playerGet: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const worksheet = await loadWorksheet(ctx.db, input.id);
      return mapWorksheet(worksheet, { hideSolution: true });
    }),

  getResults: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const worksheet = await loadWorksheet(ctx.db, input.id);
      const mapped = mapWorksheet(worksheet, { hideSolution: false });
      return mapped;
    }),

  create: publicProcedure
    .input(worksheetCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const worksheet = await ctx.db.worksheet.create({
        data: {
          targetLang: input.targetLang,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          section: input.section.trim(),
          maxScore: input.maxScore ?? null,
          questions: {
            create: input.questions.map((q, i) => toQuestionWrite(q, i)),
          },
        },
        include: worksheetInclude,
      });
      return mapWorksheet(worksheet, { hideSolution: false });
    }),

  update: publicProcedure
    .input(worksheetUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await loadWorksheet(ctx.db, input.id);
      if (existing.status === WorksheetStatus.COMPLETED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot update a completed worksheet",
        });
      }

      const answeredIds = new Set(
        existing.questions.filter((q) => q.answer).map((q) => q.id),
      );

      if (input.deleteQuestionIds?.length) {
        for (const id of input.deleteQuestionIds) {
          if (answeredIds.has(id)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Cannot delete answered question ${id}`,
            });
          }
        }
      }

      if (input.questions) {
        for (const question of input.questions) {
          if (question.id && answeredIds.has(question.id)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Cannot rewrite answered question ${question.id}`,
            });
          }
        }
      }

      const remainingAfterDelete = existing.questions.filter(
        (q) => !input.deleteQuestionIds?.includes(q.id),
      ).length;
      const newCount =
        (input.questions?.filter((q) => !q.id).length ?? 0) + remainingAfterDelete;
      if (newCount < 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Worksheet must keep at least one question",
        });
      }

      const maxSort = existing.questions.reduce(
        (max, q) => Math.max(max, q.sortOrder),
        -1,
      );

      const worksheet = await ctx.db.$transaction(async (tx) => {
        if (input.deleteQuestionIds?.length) {
          await tx.worksheetQuestion.deleteMany({
            where: {
              worksheetId: input.id,
              id: { in: input.deleteQuestionIds },
            },
          });
        }

        if (input.questions) {
          let nextSort = maxSort + 1;
          for (const [index, question] of input.questions.entries()) {
            const data = toQuestionWrite(
              question,
              question.sortOrder ?? (question.id ? index : nextSort),
            );
            if (question.id) {
              const found = existing.questions.find((q) => q.id === question.id);
              if (!found) {
                throw new TRPCError({
                  code: "NOT_FOUND",
                  message: `Question ${question.id} not found on worksheet`,
                });
              }
              await tx.worksheetQuestion.update({
                where: { id: question.id },
                data: {
                  type: data.type,
                  categoryLabel: data.categoryLabel,
                  prompt: data.prompt,
                  hint: data.hint,
                  points: data.points,
                  payload: data.payload,
                  accepted: data.accepted,
                  explanation: data.explanation,
                  grammarTopicId: data.grammarTopicId,
                  entryId: data.entryId,
                  tags: data.tags,
                  ...(question.sortOrder !== undefined && {
                    sortOrder: question.sortOrder,
                  }),
                },
              });
            } else {
              await tx.worksheetQuestion.create({
                data: {
                  worksheetId: input.id,
                  type: data.type,
                  categoryLabel: data.categoryLabel,
                  prompt: data.prompt,
                  hint: data.hint,
                  points: data.points,
                  payload: data.payload,
                  accepted: data.accepted,
                  explanation: data.explanation,
                  grammarTopicId: data.grammarTopicId,
                  entryId: data.entryId,
                  tags: data.tags,
                  sortOrder: data.sortOrder,
                },
              });
              nextSort += 1;
            }
          }
        }

        return tx.worksheet.update({
          where: { id: input.id },
          data: {
            ...(input.targetLang !== undefined && {
              targetLang: input.targetLang,
            }),
            ...(input.title !== undefined && { title: input.title.trim() }),
            ...(input.description !== undefined && {
              description: input.description?.trim() || null,
            }),
            ...(input.section !== undefined && {
              section: input.section.trim(),
            }),
            ...(input.maxScore !== undefined && { maxScore: input.maxScore }),
          },
          include: worksheetInclude,
        });
      });

      return mapWorksheet(worksheet, { hideSolution: false });
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await ctx.db.worksheet.delete({ where: { id: input.id } });
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Worksheet ${input.id} not found`,
        });
      }
      return { success: true, id: input.id };
    }),

  submitAnswer: publicProcedure
    .input(
      z.object({
        questionId: z.string().min(1),
        userAnswer: worksheetUserAnswerSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const question = await ctx.db.worksheetQuestion.findUnique({
        where: { id: input.questionId },
        include: questionInclude,
      });
      if (!question) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Question ${input.questionId} not found`,
        });
      }

      const alreadyAnswered = Boolean(question.answer);
      const prior = await ctx.db.worksheet.findUnique({
        where: { id: question.worksheetId },
        select: { status: true },
      });
      const wasCompleted = prior?.status === WorksheetStatus.COMPLETED;
      const now = new Date();
      await ctx.db.$transaction(async (tx) => {
        await submitOne({
          db: tx,
          question,
          userAnswer: input.userAnswer,
        });
        await syncWorksheetStatus(tx, question.worksheetId, now);
      });

      const worksheet = await loadWorksheet(ctx.db, question.worksheetId);
      const mapped = mapWorksheet(worksheet, { hideSolution: true });
      const answered = worksheet.questions.find((q) => q.id === input.questionId)?.answer;
      const gamification =
        alreadyAnswered || !answered
          ? undefined
          : await recordActivity(ctx.db, ctx.userId, {
              items: [
                {
                  targetLang: worksheet.targetLang,
                  isCorrect: isAnswerCorrect({
                    autoCorrect: answered.autoCorrect,
                    manualOverride: answered.manualOverride,
                  }),
                  isTypo: answered.isTypo,
                },
              ],
              worksheetCompleted:
                !wasCompleted && worksheet.status === WorksheetStatus.COMPLETED,
              worksheetTargetLang: worksheet.targetLang,
            });
      return { ...mapped, gamification };
    }),

  submitAnswers: publicProcedure
    .input(
      z.object({
        worksheetId: z.string().min(1),
        answers: z
          .array(
            z.object({
              questionId: z.string().min(1),
              userAnswer: worksheetUserAnswerSchema,
            }),
          )
          .min(1)
          .max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const worksheet = await loadWorksheet(ctx.db, input.worksheetId);
      const byId = new Map(worksheet.questions.map((q) => [q.id, q]));
      const now = new Date();
      const pendingIds = new Set(
        input.answers
          .filter((item) => {
            const question = byId.get(item.questionId);
            return question && !question.answer;
          })
          .map((item) => item.questionId),
      );
      const wasCompleted = worksheet.status === WorksheetStatus.COMPLETED;

      await ctx.db.$transaction(async (tx) => {
        for (const item of input.answers) {
          const question = byId.get(item.questionId);
          if (!question) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Question ${item.questionId} not found on worksheet`,
            });
          }
          if (question.answer) continue;
          await submitOne({
            db: tx,
            question,
            userAnswer: item.userAnswer,
          });
        }
        await syncWorksheetStatus(tx, input.worksheetId, now);
      });

      const updated = await loadWorksheet(ctx.db, input.worksheetId);
      const mapped = mapWorksheet(updated, { hideSolution: true });
      const items = updated.questions
        .filter((question) => pendingIds.has(question.id) && question.answer)
        .map((question) => ({
          targetLang: updated.targetLang,
          isCorrect: isAnswerCorrect({
            autoCorrect: question.answer!.autoCorrect,
            manualOverride: question.answer!.manualOverride,
          }),
          isTypo: question.answer!.isTypo,
        }));
      const gamification =
        items.length === 0
          ? undefined
          : await recordActivity(ctx.db, ctx.userId, {
              items,
              worksheetCompleted:
                !wasCompleted && updated.status === WorksheetStatus.COMPLETED,
              worksheetTargetLang: updated.targetLang,
            });
      return { ...mapped, gamification };
    }),

  overrideGrade: publicProcedure
    .input(
      z.object({
        questionId: z.string().min(1),
        isCorrect: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const question = await ctx.db.worksheetQuestion.findUnique({
        where: { id: input.questionId },
        include: { answer: true },
      });
      if (!question) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Question ${input.questionId} not found`,
        });
      }
      if (!question.answer) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Question has not been answered yet",
        });
      }

      await ctx.db.worksheetAnswer.update({
        where: { id: question.answer.id },
        data: {
          manualOverride: input.isCorrect,
          overriddenAt: new Date(),
        },
      });

      const worksheet = await loadWorksheet(ctx.db, question.worksheetId);
      return mapWorksheet(worksheet, { hideSolution: true });
    }),
});

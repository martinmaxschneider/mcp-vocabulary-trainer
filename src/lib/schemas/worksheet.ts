import { z } from "zod";
import { WorksheetQuestionType, WorksheetStatus } from "@prisma/client";

export { WorksheetQuestionType, WorksheetStatus };

const optionSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(400),
});

const stringValuesSchema = z.object({
  values: z.array(z.string().min(1).max(400)).min(1).max(20),
});

export const multipleChoicePayloadSchema = z.object({
  options: z.array(optionSchema).min(2).max(12),
});
export const multipleChoiceAcceptedSchema = z.object({
  optionId: z.string().min(1).max(80),
});

export const clozePayloadSchema = z.object({
  text: z.string().min(1).max(2000),
});
export const clozeAcceptedSchema = z.object({
  blanks: z.array(stringValuesSchema).min(1).max(20),
});

export const emptyPayloadSchema = z.object({}).strict();

export const freeTextAcceptedSchema = z.object({
  values: z.array(z.string().min(1).max(800)).min(1).max(20),
});

export const errorCorrectionPayloadSchema = z.object({
  sentence: z.string().min(1).max(2000),
});
export const errorCorrectionAcceptedSchema = freeTextAcceptedSchema;

export const sentenceReorderPayloadSchema = z.object({
  tokens: z.array(z.string().min(1).max(80)).min(2).max(30),
});
export const sentenceReorderAcceptedSchema = z.object({
  order: z.array(z.string().min(1).max(80)).min(2).max(30),
});

export const matchingPayloadSchema = z.object({
  left: z.array(z.string().min(1).max(200)).min(2).max(16),
  right: z.array(z.string().min(1).max(200)).min(2).max(16),
});
export const matchingAcceptedSchema = z.object({
  pairs: z
    .array(
      z.object({
        left: z.string().min(1).max(200),
        right: z.string().min(1).max(200),
      }),
    )
    .min(2)
    .max(16),
});

export const trueFalseAcceptedSchema = z.object({
  isTrue: z.boolean(),
});

export const conjugationGridPayloadSchema = z.object({
  verb: z.string().min(1).max(80),
  tenseKey: z.string().min(1).max(40),
  persons: z.array(z.number().int().min(0).max(20)).min(1).max(12),
});
export const conjugationGridAcceptedSchema = z.object({
  cells: z
    .array(
      z.object({
        personIndex: z.number().int().min(0).max(20),
        values: z.array(z.string().min(1).max(80)).min(1).max(10),
      }),
    )
    .min(1)
    .max(12),
});

const questionMetaSchema = {
  id: z.string().min(1).optional(),
  categoryLabel: z.string().min(1).max(80).optional(),
  prompt: z.string().min(1).max(2000),
  hint: z.string().max(500).optional(),
  points: z.number().int().min(1).max(20).optional(),
  sortOrder: z.number().int().min(0).optional(),
  explanation: z.string().max(2000).optional(),
  grammarTopicId: z.string().min(1).optional(),
  entryId: z.string().min(1).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
};

export const worksheetQuestionInputSchema = z.discriminatedUnion("type", [
  z.object({
    ...questionMetaSchema,
    type: z.literal(WorksheetQuestionType.MULTIPLE_CHOICE),
    payload: multipleChoicePayloadSchema,
    accepted: multipleChoiceAcceptedSchema,
  }),
  z.object({
    ...questionMetaSchema,
    type: z.literal(WorksheetQuestionType.CLOZE),
    payload: clozePayloadSchema,
    accepted: clozeAcceptedSchema,
  }),
  z.object({
    ...questionMetaSchema,
    type: z.literal(WorksheetQuestionType.FREE_TEXT),
    payload: emptyPayloadSchema.optional().default({}),
    accepted: freeTextAcceptedSchema,
  }),
  z.object({
    ...questionMetaSchema,
    type: z.literal(WorksheetQuestionType.ERROR_CORRECTION),
    payload: errorCorrectionPayloadSchema,
    accepted: errorCorrectionAcceptedSchema,
  }),
  z.object({
    ...questionMetaSchema,
    type: z.literal(WorksheetQuestionType.SENTENCE_REORDER),
    payload: sentenceReorderPayloadSchema,
    accepted: sentenceReorderAcceptedSchema,
  }),
  z.object({
    ...questionMetaSchema,
    type: z.literal(WorksheetQuestionType.MATCHING),
    payload: matchingPayloadSchema,
    accepted: matchingAcceptedSchema,
  }),
  z.object({
    ...questionMetaSchema,
    type: z.literal(WorksheetQuestionType.TRUE_FALSE),
    payload: emptyPayloadSchema.optional().default({}),
    accepted: trueFalseAcceptedSchema,
  }),
  z.object({
    ...questionMetaSchema,
    type: z.literal(WorksheetQuestionType.CONJUGATION_GRID),
    payload: conjugationGridPayloadSchema,
    accepted: conjugationGridAcceptedSchema,
  }),
]);

export type WorksheetQuestionInput = z.infer<typeof worksheetQuestionInputSchema>;

export const worksheetCreateInputSchema = z.object({
  targetLang: z.string().min(1).max(16),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  section: z.string().min(1).max(80),
  maxScore: z.number().int().min(1).max(100).optional(),
  questions: z.array(worksheetQuestionInputSchema).min(1).max(50),
});

export const worksheetUpdateInputSchema = z.object({
  id: z.string().min(1),
  targetLang: z.string().min(1).max(16).optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  section: z.string().min(1).max(80).optional(),
  maxScore: z.number().int().min(1).max(100).nullable().optional(),
  questions: z.array(worksheetQuestionInputSchema).min(1).max(50).optional(),
  deleteQuestionIds: z.array(z.string().min(1)).max(50).optional(),
});

export const multipleChoiceUserAnswerSchema = z.object({
  type: z.literal(WorksheetQuestionType.MULTIPLE_CHOICE),
  optionId: z.string().min(1),
});
export const clozeUserAnswerSchema = z.object({
  type: z.literal(WorksheetQuestionType.CLOZE),
  blanks: z.array(z.string()),
});
export const freeTextUserAnswerSchema = z.object({
  type: z.literal(WorksheetQuestionType.FREE_TEXT),
  text: z.string(),
});
export const errorCorrectionUserAnswerSchema = z.object({
  type: z.literal(WorksheetQuestionType.ERROR_CORRECTION),
  text: z.string(),
});
export const sentenceReorderUserAnswerSchema = z.object({
  type: z.literal(WorksheetQuestionType.SENTENCE_REORDER),
  order: z.array(z.string()),
});
export const matchingUserAnswerSchema = z.object({
  type: z.literal(WorksheetQuestionType.MATCHING),
  pairs: z.array(
    z.object({
      left: z.string(),
      right: z.string(),
    }),
  ),
});
export const trueFalseUserAnswerSchema = z.object({
  type: z.literal(WorksheetQuestionType.TRUE_FALSE),
  isTrue: z.boolean(),
  justification: z.string().max(2000).optional(),
});
export const conjugationGridUserAnswerSchema = z.object({
  type: z.literal(WorksheetQuestionType.CONJUGATION_GRID),
  cells: z.array(
    z.object({
      personIndex: z.number().int().min(0).max(20),
      form: z.string(),
    }),
  ),
});

export const worksheetUserAnswerSchema = z.discriminatedUnion("type", [
  multipleChoiceUserAnswerSchema,
  clozeUserAnswerSchema,
  freeTextUserAnswerSchema,
  errorCorrectionUserAnswerSchema,
  sentenceReorderUserAnswerSchema,
  matchingUserAnswerSchema,
  trueFalseUserAnswerSchema,
  conjugationGridUserAnswerSchema,
]);

export type WorksheetUserAnswer = z.infer<typeof worksheetUserAnswerSchema>;

export function countClozeBlanks(text: string): number {
  const matches = text.match(/_{3,}/g);
  return matches?.length ?? 0;
}

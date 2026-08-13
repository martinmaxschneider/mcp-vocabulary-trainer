import { WorksheetQuestionType } from "@prisma/client";
import type { WorksheetUserAnswer } from "~/lib/schemas/worksheet";
import {
  clozeAcceptedSchema,
  clozePayloadSchema,
  conjugationGridAcceptedSchema,
  conjugationGridPayloadSchema,
  freeTextAcceptedSchema,
  matchingAcceptedSchema,
  matchingPayloadSchema,
  multipleChoiceAcceptedSchema,
  multipleChoicePayloadSchema,
  sentenceReorderAcceptedSchema,
  sentenceReorderPayloadSchema,
  trueFalseAcceptedSchema,
} from "~/lib/schemas/worksheet";
import { countClozeBlanks } from "~/lib/schemas/worksheet";

export function formatAcceptedAnswer(params: {
  type: WorksheetQuestionType;
  payload: unknown;
  accepted: unknown;
  trueLabel: string;
  falseLabel: string;
}): string {
  switch (params.type) {
    case WorksheetQuestionType.MULTIPLE_CHOICE: {
      const payload = multipleChoicePayloadSchema.safeParse(params.payload);
      const accepted = multipleChoiceAcceptedSchema.safeParse(params.accepted);
      if (!accepted.success) return "";
      const option = payload.success
        ? payload.data.options.find((o) => o.id === accepted.data.optionId)
        : undefined;
      return option?.label ?? accepted.data.optionId;
    }
    case WorksheetQuestionType.CLOZE: {
      const accepted = clozeAcceptedSchema.safeParse(params.accepted);
      if (!accepted.success) return "";
      return accepted.data.blanks.map((blank) => blank.values[0] ?? "").join(" · ");
    }
    case WorksheetQuestionType.FREE_TEXT:
    case WorksheetQuestionType.ERROR_CORRECTION: {
      const accepted = freeTextAcceptedSchema.safeParse(params.accepted);
      return accepted.success ? (accepted.data.values[0] ?? "") : "";
    }
    case WorksheetQuestionType.SENTENCE_REORDER: {
      const accepted = sentenceReorderAcceptedSchema.safeParse(params.accepted);
      return accepted.success ? accepted.data.order.join(" ") : "";
    }
    case WorksheetQuestionType.MATCHING: {
      const accepted = matchingAcceptedSchema.safeParse(params.accepted);
      if (!accepted.success) return "";
      return accepted.data.pairs
        .map((pair) => `${pair.left} → ${pair.right}`)
        .join(" · ");
    }
    case WorksheetQuestionType.TRUE_FALSE: {
      const accepted = trueFalseAcceptedSchema.safeParse(params.accepted);
      if (!accepted.success) return "";
      return accepted.data.isTrue ? params.trueLabel : params.falseLabel;
    }
    case WorksheetQuestionType.CONJUGATION_GRID: {
      const accepted = conjugationGridAcceptedSchema.safeParse(params.accepted);
      if (!accepted.success) return "";
      return accepted.data.cells.map((cell) => cell.values[0] ?? "").join(" · ");
    }
    default:
      return "";
  }
}

export function isDraftComplete(
  type: WorksheetQuestionType,
  payload: unknown,
  draft: WorksheetUserAnswer | undefined,
): boolean {
  if (!draft || draft.type !== type) return false;
  switch (draft.type) {
    case WorksheetQuestionType.MULTIPLE_CHOICE:
      return draft.optionId.length > 0;
    case WorksheetQuestionType.CLOZE:
      return (
        draft.blanks.length > 0 &&
        draft.blanks.every((blank) => blank.trim().length > 0)
      );
    case WorksheetQuestionType.FREE_TEXT:
    case WorksheetQuestionType.ERROR_CORRECTION:
      return draft.text.trim().length > 0;
    case WorksheetQuestionType.SENTENCE_REORDER: {
      const parsed = sentenceReorderPayloadSchema.safeParse(payload);
      return parsed.success && draft.order.length === parsed.data.tokens.length;
    }
    case WorksheetQuestionType.MATCHING: {
      const parsed = matchingPayloadSchema.safeParse(payload);
      return parsed.success && draft.pairs.length === parsed.data.left.length;
    }
    case WorksheetQuestionType.TRUE_FALSE:
      return typeof draft.isTrue === "boolean";
    case WorksheetQuestionType.CONJUGATION_GRID: {
      const parsed = conjugationGridPayloadSchema.safeParse(payload);
      if (!parsed.success) return false;
      if (draft.cells.length !== parsed.data.persons.length) return false;
      return draft.cells.every((cell) => cell.form.trim().length > 0);
    }
    default:
      return false;
  }
}

export function emptyDraft(
  type: WorksheetQuestionType,
  payload: unknown,
): WorksheetUserAnswer {
  switch (type) {
    case WorksheetQuestionType.MULTIPLE_CHOICE:
      return { type, optionId: "" };
    case WorksheetQuestionType.CLOZE: {
      const parsed = clozePayloadSchema.safeParse(payload);
      const count = parsed.success ? countClozeBlanks(parsed.data.text) : 0;
      return { type, blanks: Array.from({ length: count }, () => "") };
    }
    case WorksheetQuestionType.FREE_TEXT:
      return { type, text: "" };
    case WorksheetQuestionType.ERROR_CORRECTION:
      return { type, text: "" };
    case WorksheetQuestionType.SENTENCE_REORDER:
      return { type, order: [] };
    case WorksheetQuestionType.MATCHING:
      return { type, pairs: [] };
    case WorksheetQuestionType.TRUE_FALSE:
      return { type, isTrue: true, justification: "" };
    case WorksheetQuestionType.CONJUGATION_GRID: {
      const parsed = conjugationGridPayloadSchema.safeParse(payload);
      const persons = parsed.success ? parsed.data.persons : [];
      return {
        type,
        cells: persons.map((personIndex) => ({ personIndex, form: "" })),
      };
    }
    default:
      return { type: WorksheetQuestionType.FREE_TEXT, text: "" };
  }
}

export function splitCloze(text: string): string[] {
  return text.split(/_{3,}/);
}

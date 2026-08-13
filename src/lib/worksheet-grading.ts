import { WorksheetQuestionType } from "@prisma/client";
import { matchAnswer, normalizeText } from "~/lib/matching";
import {
  clozeAcceptedSchema,
  conjugationGridAcceptedSchema,
  conjugationGridPayloadSchema,
  errorCorrectionAcceptedSchema,
  freeTextAcceptedSchema,
  matchingAcceptedSchema,
  matchingPayloadSchema,
  multipleChoiceAcceptedSchema,
  sentenceReorderAcceptedSchema,
  sentenceReorderPayloadSchema,
  trueFalseAcceptedSchema,
  worksheetUserAnswerSchema,
  type WorksheetUserAnswer,
} from "~/lib/schemas/worksheet";

export type GradeResult = {
  autoCorrect: boolean;
  isTypo: boolean;
};

function allCorrect(parts: GradeResult[]): GradeResult {
  if (parts.length === 0) {
    return { autoCorrect: false, isTypo: false };
  }
  const autoCorrect = parts.every((p) => p.autoCorrect);
  const isTypo = autoCorrect && parts.some((p) => p.isTypo);
  return { autoCorrect, isTypo };
}

function matchValues(user: string, values: string[]): GradeResult {
  const [expected, ...variants] = values;
  if (!expected) {
    return { autoCorrect: false, isTypo: false };
  }
  const result = matchAnswer({
    userAnswer: user,
    expected,
    variants,
  });
  return { autoCorrect: result.isCorrect, isTypo: result.isTypo };
}

function sameTokenList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((token, i) => normalizeText(token) === normalizeText(b[i]!));
}

function pairKey(left: string, right: string): string {
  return `${normalizeText(left)}=>${normalizeText(right)}`;
}

export function isAnswerCorrect(params: {
  autoCorrect: boolean;
  manualOverride?: boolean | null;
}): boolean {
  if (params.manualOverride === true) return true;
  if (params.manualOverride === false) return false;
  return params.autoCorrect;
}

export function computeDisplayScore(params: {
  earnedPoints: number;
  totalPoints: number;
  maxScore: number | null | undefined;
}): { score: number; max: number } {
  const max = params.maxScore && params.maxScore > 0
    ? params.maxScore
    : params.totalPoints;
  if (params.totalPoints <= 0) {
    return { score: 0, max };
  }
  if (max === params.totalPoints) {
    return { score: params.earnedPoints, max };
  }
  return {
    score: Math.round((params.earnedPoints / params.totalPoints) * max),
    max,
  };
}

export function gradeQuestion(params: {
  type: WorksheetQuestionType;
  payload: unknown;
  accepted: unknown;
  userAnswer: unknown;
}): GradeResult {
  const parsedAnswer = worksheetUserAnswerSchema.safeParse(params.userAnswer);
  if (!parsedAnswer.success) {
    return { autoCorrect: false, isTypo: false };
  }
  if (parsedAnswer.data.type !== params.type) {
    return { autoCorrect: false, isTypo: false };
  }
  const answer = parsedAnswer.data;

  switch (params.type) {
    case WorksheetQuestionType.MULTIPLE_CHOICE:
      return gradeMultipleChoice(params.accepted, answer);
    case WorksheetQuestionType.CLOZE:
      return gradeCloze(params.accepted, answer);
    case WorksheetQuestionType.FREE_TEXT:
      return gradeFreeText(params.accepted, answer);
    case WorksheetQuestionType.ERROR_CORRECTION:
      return gradeErrorCorrection(params.accepted, answer);
    case WorksheetQuestionType.SENTENCE_REORDER:
      return gradeSentenceReorder(params.payload, params.accepted, answer);
    case WorksheetQuestionType.MATCHING:
      return gradeMatching(params.payload, params.accepted, answer);
    case WorksheetQuestionType.TRUE_FALSE:
      return gradeTrueFalse(params.accepted, answer);
    case WorksheetQuestionType.CONJUGATION_GRID:
      return gradeConjugationGrid(params.payload, params.accepted, answer);
    default:
      return { autoCorrect: false, isTypo: false };
  }
}

function gradeMultipleChoice(
  acceptedRaw: unknown,
  answer: WorksheetUserAnswer,
): GradeResult {
  if (answer.type !== WorksheetQuestionType.MULTIPLE_CHOICE) {
    return { autoCorrect: false, isTypo: false };
  }
  const accepted = multipleChoiceAcceptedSchema.safeParse(acceptedRaw);
  if (!accepted.success) {
    return { autoCorrect: false, isTypo: false };
  }
  return {
    autoCorrect: answer.optionId === accepted.data.optionId,
    isTypo: false,
  };
}

function gradeCloze(
  acceptedRaw: unknown,
  answer: WorksheetUserAnswer,
): GradeResult {
  if (answer.type !== WorksheetQuestionType.CLOZE) {
    return { autoCorrect: false, isTypo: false };
  }
  const accepted = clozeAcceptedSchema.safeParse(acceptedRaw);
  if (!accepted.success) {
    return { autoCorrect: false, isTypo: false };
  }
  if (answer.blanks.length !== accepted.data.blanks.length) {
    return { autoCorrect: false, isTypo: false };
  }
  return allCorrect(
    accepted.data.blanks.map((blank, i) =>
      matchValues(answer.blanks[i] ?? "", blank.values),
    ),
  );
}

function gradeFreeText(
  acceptedRaw: unknown,
  answer: WorksheetUserAnswer,
): GradeResult {
  if (answer.type !== WorksheetQuestionType.FREE_TEXT) {
    return { autoCorrect: false, isTypo: false };
  }
  const accepted = freeTextAcceptedSchema.safeParse(acceptedRaw);
  if (!accepted.success) {
    return { autoCorrect: false, isTypo: false };
  }
  return matchValues(answer.text, accepted.data.values);
}

function gradeErrorCorrection(
  acceptedRaw: unknown,
  answer: WorksheetUserAnswer,
): GradeResult {
  if (answer.type !== WorksheetQuestionType.ERROR_CORRECTION) {
    return { autoCorrect: false, isTypo: false };
  }
  const accepted = errorCorrectionAcceptedSchema.safeParse(acceptedRaw);
  if (!accepted.success) {
    return { autoCorrect: false, isTypo: false };
  }
  return matchValues(answer.text, accepted.data.values);
}

function gradeSentenceReorder(
  payloadRaw: unknown,
  acceptedRaw: unknown,
  answer: WorksheetUserAnswer,
): GradeResult {
  if (answer.type !== WorksheetQuestionType.SENTENCE_REORDER) {
    return { autoCorrect: false, isTypo: false };
  }
  const payload = sentenceReorderPayloadSchema.safeParse(payloadRaw);
  const accepted = sentenceReorderAcceptedSchema.safeParse(acceptedRaw);
  if (!payload.success || !accepted.success) {
    return { autoCorrect: false, isTypo: false };
  }
  if (answer.order.length !== accepted.data.order.length) {
    return { autoCorrect: false, isTypo: false };
  }
  return {
    autoCorrect: sameTokenList(answer.order, accepted.data.order),
    isTypo: false,
  };
}

function gradeMatching(
  payloadRaw: unknown,
  acceptedRaw: unknown,
  answer: WorksheetUserAnswer,
): GradeResult {
  if (answer.type !== WorksheetQuestionType.MATCHING) {
    return { autoCorrect: false, isTypo: false };
  }
  const payload = matchingPayloadSchema.safeParse(payloadRaw);
  const accepted = matchingAcceptedSchema.safeParse(acceptedRaw);
  if (!payload.success || !accepted.success) {
    return { autoCorrect: false, isTypo: false };
  }
  if (answer.pairs.length !== accepted.data.pairs.length) {
    return { autoCorrect: false, isTypo: false };
  }
  const expected = new Set(
    accepted.data.pairs.map((p) => pairKey(p.left, p.right)),
  );
  const given = new Set(answer.pairs.map((p) => pairKey(p.left, p.right)));
  if (expected.size !== given.size) {
    return { autoCorrect: false, isTypo: false };
  }
  for (const key of expected) {
    if (!given.has(key)) {
      return { autoCorrect: false, isTypo: false };
    }
  }
  return { autoCorrect: true, isTypo: false };
}

function gradeTrueFalse(
  acceptedRaw: unknown,
  answer: WorksheetUserAnswer,
): GradeResult {
  if (answer.type !== WorksheetQuestionType.TRUE_FALSE) {
    return { autoCorrect: false, isTypo: false };
  }
  const accepted = trueFalseAcceptedSchema.safeParse(acceptedRaw);
  if (!accepted.success) {
    return { autoCorrect: false, isTypo: false };
  }
  return {
    autoCorrect: answer.isTrue === accepted.data.isTrue,
    isTypo: false,
  };
}

function gradeConjugationGrid(
  payloadRaw: unknown,
  acceptedRaw: unknown,
  answer: WorksheetUserAnswer,
): GradeResult {
  if (answer.type !== WorksheetQuestionType.CONJUGATION_GRID) {
    return { autoCorrect: false, isTypo: false };
  }
  const payload = conjugationGridPayloadSchema.safeParse(payloadRaw);
  const accepted = conjugationGridAcceptedSchema.safeParse(acceptedRaw);
  if (!payload.success || !accepted.success) {
    return { autoCorrect: false, isTypo: false };
  }
  const byPerson = new Map(
    accepted.data.cells.map((cell) => [cell.personIndex, cell.values]),
  );
  if (answer.cells.length !== byPerson.size) {
    return { autoCorrect: false, isTypo: false };
  }
  const parts: GradeResult[] = [];
  for (const cell of answer.cells) {
    const values = byPerson.get(cell.personIndex);
    if (!values) {
      return { autoCorrect: false, isTypo: false };
    }
    parts.push(matchValues(cell.form, values));
  }
  return allCorrect(parts);
}

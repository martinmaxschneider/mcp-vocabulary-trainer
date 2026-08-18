import { SatzRegister } from "@prisma/client";
import { TARGET_LANGS } from "~/lib/languages";
import { looksLikeQuestion } from "~/lib/satz-question";
import type { DraftCandidate, DraftTranslation } from "~/lib/satz-import";
import { findSimilarQuestions } from "~/server/services/embeddings";
import { classifySatzAnswer } from "~/server/services/openai";

export type AnswerQuestionSuggestion = {
  isAnswer: boolean;
  suggestedQuestionText: string | null;
  questionTranslations: DraftTranslation[];
  candidates: DraftCandidate[];
  matchId: string | null;
};

function toQuestionTranslations(
  register: SatzRegister,
  byLang: Record<string, string> | undefined,
): DraftTranslation[] {
  if (!byLang) return [];
  return Object.entries(byLang)
    .filter(([, text]) => text.trim().length > 0)
    .map(([lang, text]) => ({
      lang,
      text: text.trim(),
      register,
    }));
}

export async function matchExistingQuestion(
  questionText: string,
  excludeId?: string,
): Promise<{ candidates: DraftCandidate[]; matchId: string | null }> {
  const similar = await findSimilarQuestions(questionText, { excludeId });
  const matchId = similar.flagged[0]?.id ?? null;
  return {
    matchId,
    candidates: similar.candidates.map((c) => ({
      id: c.id,
      mainText: c.mainText,
      score: c.score,
      llmMatch: c.id === matchId,
    })),
  };
}

export async function resolveAnswerQuestion(params: {
  mainText: string;
  isAnswer?: boolean;
  question?: string | null;
  questionTranslations?: Record<string, string>;
  register?: SatzRegister;
  excludeId?: string;
}): Promise<AnswerQuestionSuggestion> {
  if (looksLikeQuestion(params.mainText)) {
    return {
      isAnswer: false,
      suggestedQuestionText: null,
      questionTranslations: [],
      candidates: [],
      matchId: null,
    };
  }

  const register = params.register ?? SatzRegister.INFORMAL;
  const question = params.question?.trim() || null;
  if (!params.isAnswer || !question) {
    return {
      isAnswer: false,
      suggestedQuestionText: null,
      questionTranslations: [],
      candidates: [],
      matchId: null,
    };
  }

  const matched = await matchExistingQuestion(question, params.excludeId);
  return {
    isAnswer: true,
    suggestedQuestionText: question,
    questionTranslations: toQuestionTranslations(
      register,
      params.questionTranslations,
    ),
    candidates: matched.candidates,
    matchId: matched.matchId,
  };
}

export async function suggestAnswerQuestion(params: {
  mainText: string;
  excludeId?: string;
}): Promise<AnswerQuestionSuggestion> {
  if (looksLikeQuestion(params.mainText)) {
    return {
      isAnswer: false,
      suggestedQuestionText: null,
      questionTranslations: [],
      candidates: [],
      matchId: null,
    };
  }

  const classified = await classifySatzAnswer({
    germanText: params.mainText,
    targetLangs: TARGET_LANGS.map((l) => l.code),
  });

  return resolveAnswerQuestion({
    mainText: params.mainText,
    isAnswer: classified.isAnswer,
    question: classified.question,
    questionTranslations: classified.questionTranslations,
    excludeId: params.excludeId,
  });
}

import { describe, expect, it } from "vitest";
import { WorksheetQuestionType } from "@prisma/client";
import {
  computeDisplayScore,
  gradeQuestion,
  isAnswerCorrect,
} from "~/lib/worksheet-grading";

describe("gradeQuestion", () => {
  it("grades multiple choice by option id", () => {
    const result = gradeQuestion({
      type: WorksheetQuestionType.MULTIPLE_CHOICE,
      payload: { options: [{ id: "le", label: "le" }, { id: "du", label: "du" }] },
      accepted: { optionId: "du" },
      userAnswer: { type: "MULTIPLE_CHOICE", optionId: "du" },
    });
    expect(result).toEqual({ autoCorrect: true, isTypo: false });
  });

  it("rejects the wrong multiple-choice option", () => {
    const result = gradeQuestion({
      type: WorksheetQuestionType.MULTIPLE_CHOICE,
      payload: { options: [{ id: "le", label: "le" }, { id: "du", label: "du" }] },
      accepted: { optionId: "du" },
      userAnswer: { type: "MULTIPLE_CHOICE", optionId: "le" },
    });
    expect(result.autoCorrect).toBe(false);
  });

  it("grades cloze blanks with variants and typos", () => {
    const correct = gradeQuestion({
      type: WorksheetQuestionType.CLOZE,
      payload: { text: "Je ___ bois ___ de café." },
      accepted: {
        blanks: [{ values: ["ne"] }, { values: ["pas"] }],
      },
      userAnswer: { type: "CLOZE", blanks: ["ne", "pas"] },
    });
    expect(correct.autoCorrect).toBe(true);
    expect(correct.isTypo).toBe(false);

    const typo = gradeQuestion({
      type: WorksheetQuestionType.CLOZE,
      payload: { text: "Je ___ bois ___ de café." },
      accepted: {
        blanks: [{ values: ["ne"] }, { values: ["pas"] }],
      },
      userAnswer: { type: "CLOZE", blanks: ["ne", "pa"] },
    });
    expect(typo.autoCorrect).toBe(true);
    expect(typo.isTypo).toBe(true);
  });

  it("grades free text including diacritic-insensitive matches", () => {
    const result = gradeQuestion({
      type: WorksheetQuestionType.FREE_TEXT,
      payload: {},
      accepted: { values: ["Je n'ai pas le temps."] },
      userAnswer: { type: "FREE_TEXT", text: "je n'ai pas le temps" },
    });
    expect(result.autoCorrect).toBe(true);
  });

  it("grades error correction against accepted sentences", () => {
    const result = gradeQuestion({
      type: WorksheetQuestionType.ERROR_CORRECTION,
      payload: { sentence: "Elle ne mange pas des pommes." },
      accepted: { values: ["Elle ne mange pas de pommes."] },
      userAnswer: {
        type: "ERROR_CORRECTION",
        text: "Elle ne mange pas de pommes.",
      },
    });
    expect(result.autoCorrect).toBe(true);
  });

  it("grades sentence reorder case-insensitively", () => {
    const result = gradeQuestion({
      type: WorksheetQuestionType.SENTENCE_REORDER,
      payload: { tokens: ["pas", "ne", "je", "bois", "café", "de"] },
      accepted: { order: ["je", "ne", "bois", "pas", "de", "café"] },
      userAnswer: {
        type: "SENTENCE_REORDER",
        order: ["Je", "ne", "bois", "pas", "de", "café"],
      },
    });
    expect(result.autoCorrect).toBe(true);
  });

  it("grades matching pairs regardless of order", () => {
    const result = gradeQuestion({
      type: WorksheetQuestionType.MATCHING,
      payload: {
        left: ["eau", "pain"],
        right: ["de l'", "du"],
      },
      accepted: {
        pairs: [
          { left: "eau", right: "de l'" },
          { left: "pain", right: "du" },
        ],
      },
      userAnswer: {
        type: "MATCHING",
        pairs: [
          { left: "pain", right: "du" },
          { left: "eau", right: "de l'" },
        ],
      },
    });
    expect(result.autoCorrect).toBe(true);
  });

  it("grades true/false without using the justification", () => {
    const result = gradeQuestion({
      type: WorksheetQuestionType.TRUE_FALSE,
      payload: {},
      accepted: { isTrue: false },
      userAnswer: {
        type: "TRUE_FALSE",
        isTrue: false,
        justification: "Nur der Teilungsartikel wird zu de.",
      },
    });
    expect(result.autoCorrect).toBe(true);
  });

  it("grades conjugation grid cells with fuzzy matching", () => {
    const result = gradeQuestion({
      type: WorksheetQuestionType.CONJUGATION_GRID,
      payload: { verb: "vouloir", tenseKey: "present", persons: [0, 1] },
      accepted: {
        cells: [
          { personIndex: 0, values: ["veux"] },
          { personIndex: 1, values: ["veux"] },
        ],
      },
      userAnswer: {
        type: "CONJUGATION_GRID",
        cells: [
          { personIndex: 0, form: "veux" },
          { personIndex: 1, form: "veu" },
        ],
      },
    });
    expect(result.autoCorrect).toBe(true);
    expect(result.isTypo).toBe(true);
  });

  it("rejects answers whose type does not match the question", () => {
    const result = gradeQuestion({
      type: WorksheetQuestionType.MULTIPLE_CHOICE,
      payload: { options: [{ id: "a", label: "a" }, { id: "b", label: "b" }] },
      accepted: { optionId: "a" },
      userAnswer: { type: "FREE_TEXT", text: "a" },
    });
    expect(result.autoCorrect).toBe(false);
  });
});

describe("isAnswerCorrect", () => {
  it("uses the automatic grade when there is no override", () => {
    expect(isAnswerCorrect({ autoCorrect: true, manualOverride: null })).toBe(
      true,
    );
    expect(isAnswerCorrect({ autoCorrect: false, manualOverride: null })).toBe(
      false,
    );
  });

  it("can override a wrong answer as correct", () => {
    expect(
      isAnswerCorrect({ autoCorrect: false, manualOverride: true }),
    ).toBe(true);
  });

  it("can override a correct answer as wrong", () => {
    expect(
      isAnswerCorrect({ autoCorrect: true, manualOverride: false }),
    ).toBe(false);
  });
});

describe("computeDisplayScore", () => {
  it("uses question points when maxScore is unset", () => {
    expect(
      computeDisplayScore({ earnedPoints: 12, totalPoints: 15, maxScore: null }),
    ).toEqual({ score: 12, max: 15 });
  });

  it("scales to a French-style /20 when maxScore differs", () => {
    expect(
      computeDisplayScore({ earnedPoints: 12, totalPoints: 15, maxScore: 20 }),
    ).toEqual({ score: 16, max: 20 });
  });
});

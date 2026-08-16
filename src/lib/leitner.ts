import { addDays } from "date-fns";

/**
 * Leitner box intervals in days.
 * Index = box number. Box 0 is reserved (unused).
 * Box 1 = 0 days (new cards + wrong answers are due immediately).
 */
export const BOX_DAYS = [0, 0, 3, 7, 14, 30, 60] as const;

export const MAX_BOX = 6;
export const MIN_BOX = 1;

export function getBoxIntervalDays(box: number): number {
  return BOX_DAYS[box] ?? BOX_DAYS[MIN_BOX]!;
}

export function nextBoxOnCorrect(currentBox: number): number {
  return Math.min(currentBox + 1, MAX_BOX);
}

export function nextBoxOnWrong(): number {
  return MIN_BOX;
}

export function scheduleNextReview(box: number, from: Date = new Date()): Date {
  return addDays(from, getBoxIntervalDays(box));
}

export function applyLeitnerResult(
  currentBox: number,
  isCorrect: boolean,
  from: Date = new Date(),
): { boxAfter: number; nextReviewAt: Date } {
  const boxAfter = isCorrect ? nextBoxOnCorrect(currentBox) : nextBoxOnWrong();
  return { boxAfter, nextReviewAt: scheduleNextReview(boxAfter, from) };
}

export const VOCAB_CARD_KEY = "vocab";
export const CONJ_CARD_PREFIX = "conj:";

export function conjugationCardKey(tenseKey: string): string {
  return `${CONJ_CARD_PREFIX}${tenseKey}`;
}

export function tenseKeyFromConjugationCardKey(cardKey: string): string | null {
  if (!cardKey.startsWith(CONJ_CARD_PREFIX)) return null;
  const tenseKey = cardKey.slice(CONJ_CARD_PREFIX.length);
  return tenseKey.length > 0 ? tenseKey : null;
}

/** Display intervals for Settings UI (boxes 1–6). */
export function getLeitnerIntervalsForDisplay(): Array<{
  box: number;
  days: number;
}> {
  return Array.from({ length: MAX_BOX }, (_, i) => {
    const box = i + 1;
    return { box, days: getBoxIntervalDays(box) };
  });
}

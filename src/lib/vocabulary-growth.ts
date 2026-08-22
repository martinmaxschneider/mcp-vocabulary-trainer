import { localDateString, shiftDateString } from "~/lib/gamification-config";

export type GrowthKind = "vocab" | "satze" | "conjugations";

export type GrowthCounts = {
  vocab: number;
  satze: number;
  conjugations: number;
  waiting: number;
};

export type GrowthDay = {
  date: string;
} & GrowthCounts;

export type GrowthEvent = {
  createdAt: Date;
  kind: GrowthKind;
};

export type GrowthRange = 30 | 90 | "all";

const EMPTY_IN_BOXES = {
  vocab: 0,
  satze: 0,
  conjugations: 0,
};

export function emptyGrowthCounts(): GrowthCounts {
  return { ...EMPTY_IN_BOXES, waiting: 0 };
}

export function inBoxesTotal(counts: Pick<GrowthCounts, GrowthKind>): number {
  return counts.vocab + counts.satze + counts.conjugations;
}

export function stackTotal(counts: GrowthCounts): number {
  return inBoxesTotal(counts) + counts.waiting;
}

export function buildVocabularyGrowth(
  progress: GrowthEvent[],
  catalog: GrowthEvent[] = [],
  today: string = localDateString(),
): {
  daily: GrowthDay[];
  cumulative: GrowthDay[];
} {
  if (progress.length === 0 && catalog.length === 0) {
    return { daily: [], cumulative: [] };
  }

  const progressByDate = new Map<string, typeof EMPTY_IN_BOXES>();
  const catalogByDate = new Map<string, typeof EMPTY_IN_BOXES>();
  let firstDate = today;

  for (const event of progress) {
    firstDate = addEvent(progressByDate, event, firstDate);
  }
  for (const event of catalog) {
    firstDate = addEvent(catalogByDate, event, firstDate);
  }

  if (firstDate > today) firstDate = today;

  const daily: GrowthDay[] = [];
  const cumulative: GrowthDay[] = [];
  const runningProgress = { ...EMPTY_IN_BOXES };
  const runningCatalog = { ...EMPTY_IN_BOXES };

  for (const date of eachDateInclusive(firstDate, today)) {
    const intake = progressByDate.get(date) ?? { ...EMPTY_IN_BOXES };
    const added = catalogByDate.get(date) ?? { ...EMPTY_IN_BOXES };
    runningProgress.vocab += intake.vocab;
    runningProgress.satze += intake.satze;
    runningProgress.conjugations += intake.conjugations;
    runningCatalog.vocab += added.vocab;
    runningCatalog.satze += added.satze;
    runningCatalog.conjugations += added.conjugations;
    const waiting = waitingFrom(runningCatalog, runningProgress);
    daily.push({ date, ...intake, waiting: 0 });
    cumulative.push({ date, ...runningProgress, waiting });
  }

  return { daily, cumulative };
}

export function sliceGrowthDays<T extends { date: string }>(
  days: T[],
  range: GrowthRange,
): T[] {
  if (range === "all" || days.length <= range) return days;
  return days.slice(-range);
}

function waitingFrom(
  catalog: typeof EMPTY_IN_BOXES,
  progress: typeof EMPTY_IN_BOXES,
): number {
  return (
    Math.max(0, catalog.vocab - progress.vocab) +
    Math.max(0, catalog.satze - progress.satze) +
    Math.max(0, catalog.conjugations - progress.conjugations)
  );
}

function addEvent(
  buckets: Map<string, typeof EMPTY_IN_BOXES>,
  event: GrowthEvent,
  firstDate: string,
): string {
  const date = localDateString(event.createdAt);
  const bucket = buckets.get(date) ?? { ...EMPTY_IN_BOXES };
  bucket[event.kind] += 1;
  buckets.set(date, bucket);
  return date < firstDate ? date : firstDate;
}

function eachDateInclusive(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = shiftDateString(cursor, 1);
    if (dates.length > 20_000) break;
  }
  return dates;
}

export const MAX_DAILY_COUNT = 200;

export const DEFAULT_DAILY_CONFIG = {
  satzCount: 5,
  vocabCount: 10,
  conjCount: 2,
} as const;

export type DailyPackageConfig = {
  satzCount: number;
  vocabCount: number;
  conjCount: number;
};

export const DAILY_TIME_PRESETS: Array<DailyPackageConfig & { minutes: number }> =
  [
    { minutes: 15, satzCount: 5, vocabCount: 8, conjCount: 2 },
    { minutes: 30, satzCount: 10, vocabCount: 15, conjCount: 4 },
    { minutes: 45, satzCount: 15, vocabCount: 22, conjCount: 6 },
  ];

export const GRAMMAR_BONUS_FACTOR = 2;
export const LEECH_WEIGHT_FACTOR = 3;

export const FALLBACK_AUDIO_MS = {
  SATZ: 8_000,
  ENTRY: 4_000,
  CONJUGATION: 15_000,
} as const;

export function parseDailyPackageConfig(
  value: unknown,
): DailyPackageConfig | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const satzCount = Number(record.satzCount);
  const vocabCount = Number(record.vocabCount);
  const conjCount = Number(record.conjCount);
  if (
    !Number.isFinite(satzCount) ||
    !Number.isFinite(vocabCount) ||
    !Number.isFinite(conjCount)
  ) {
    return null;
  }
  return {
    satzCount: clampCount(satzCount),
    vocabCount: clampCount(vocabCount),
    conjCount: clampCount(conjCount),
  };
}

export function clampCount(value: number, max = MAX_DAILY_COUNT): number {
  return Math.max(0, Math.min(max, Math.round(value)));
}

export function dailyItemKey(
  itemType: "SATZ" | "ENTRY" | "CONJUGATION",
  refId: string,
  refKey?: string | null,
): string {
  return `${itemType}:${refId}:${refKey ?? ""}`;
}

export function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = items[i]!;
    items[i] = items[j]!;
    items[j] = current;
  }
  return items;
}

export function weightedRandomPick<T>(
  items: T[],
  weightOf: (item: T) => number,
): T | undefined {
  if (items.length === 0) return undefined;
  const weights = items.map((item) => Math.max(0, weightOf(item)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return items[Math.floor(Math.random() * items.length)];
  }
  let cursor = Math.random() * total;
  for (let i = 0; i < items.length; i += 1) {
    cursor -= weights[i] ?? 0;
    if (cursor <= 0) return items[i];
  }
  return items[items.length - 1];
}

export type StratifiedCandidate = {
  key: string;
  domainId: string | null;
  weight: number;
};

export function pickStratified<T extends StratifiedCandidate>(
  items: T[],
  count: number,
): T[] {
  if (count <= 0 || items.length === 0) return [];
  const remaining = new Map(items.map((item) => [item.key, item]));
  const byDomain = new Map<string, T[]>();
  for (const item of items) {
    const domainKey = item.domainId ?? "__none__";
    const bucket = byDomain.get(domainKey) ?? [];
    bucket.push(item);
    byDomain.set(domainKey, bucket);
  }
  const rotation = shuffleInPlace([...byDomain.keys()]);
  const picked: T[] = [];

  while (picked.length < count && rotation.length > 0) {
    const domainKey = rotation.shift()!;
    const bucket = (byDomain.get(domainKey) ?? []).filter((item) =>
      remaining.has(item.key),
    );
    byDomain.set(domainKey, bucket);
    if (bucket.length === 0) continue;
    const chosen = weightedRandomPick(bucket, (item) => item.weight);
    if (!chosen) continue;
    remaining.delete(chosen.key);
    byDomain.set(
      domainKey,
      bucket.filter((item) => item.key !== chosen.key),
    );
    picked.push(chosen);
    if ((byDomain.get(domainKey) ?? []).length > 0) {
      rotation.push(domainKey);
    }
  }

  return picked;
}

export function interleaveByType<T extends { itemType: string }>(
  groups: T[][],
): T[] {
  const queues = groups.map((group) => [...group]);
  const ordered: T[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (!next) continue;
      ordered.push(next);
      added = true;
    }
  }
  return ordered;
}

export function estimatePackageDurationMs(items: Array<{
  itemType: "SATZ" | "ENTRY" | "CONJUGATION";
  audioDurationMs?: number | null;
}>): number {
  return items.reduce((sum, item) => {
    const fallback = FALLBACK_AUDIO_MS[item.itemType];
    return sum + (item.audioDurationMs && item.audioDurationMs > 0
      ? item.audioDurationMs
      : fallback);
  }, 0);
}

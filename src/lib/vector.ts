export function parseVector(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return null;
  if (!value.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return null;
  }
  return value;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export type VectorItem<T> = T & { vector: number[] };

export function topKByCosine<T>(
  query: number[],
  items: VectorItem<T>[],
  k: number,
): Array<T & { score: number }> {
  if (k <= 0) return [];

  return items
    .map((item) => ({
      ...item,
      score: cosineSimilarity(query, item.vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export function filterByThreshold<T extends { score: number }>(
  items: T[],
  threshold: number,
): T[] {
  return items.filter((item) => item.score >= threshold);
}

import { createHash } from "node:crypto";
import { EmbeddingOwnerType, Prisma, type PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import { env } from "~/env";
import { looksLikeQuestion } from "~/lib/satz-question";
import { filterByThreshold, parseVector, topKByCosine } from "~/lib/vector";
import { db } from "~/server/db";
import { judgeSemanticDuplicates } from "~/server/services/openai";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMS = 1536;
export const SIMILARITY_THRESHOLD = 0.9;
export const SIMILARITY_TOP_K = 5;
export const VOCAB_LINK_TOP_K = 12;
export const VOCAB_LINK_MIN_SCORE = 0.22;
export const QUESTION_MATCH_THRESHOLD = 0.85;
export const QUESTION_MATCH_TOP_K = 5;

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

type DbClient = PrismaClient | Prisma.TransactionClient;

export type SimilarCandidate = {
  id: string;
  mainText: string;
  score: number;
  llmMatch?: boolean;
};

export type EntryVectorRow = {
  id: string;
  mainText: string;
  vector: number[];
};

export function hashEmbeddingText(text: string): string {
  return createHash("sha256").update(text.trim(), "utf8").digest("hex");
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts.map((t) => t.trim()),
  });

  return [...response.data]
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

export async function loadEntryVectorIndex(
  excludeId?: string,
): Promise<EntryVectorRow[]> {
  const embeddings = await db.embedding.findMany({
    where: {
      ownerType: EmbeddingOwnerType.ENTRY,
      ...(excludeId ? { ownerId: { not: excludeId } } : {}),
    },
  });
  if (embeddings.length === 0) return [];

  const entries = await db.entry.findMany({
    where: { id: { in: embeddings.map((e) => e.ownerId) } },
    select: { id: true, mainText: true },
  });
  const textById = new Map(entries.map((e) => [e.id, e.mainText]));

  const rows: EntryVectorRow[] = [];
  for (const embedding of embeddings) {
    const mainText = textById.get(embedding.ownerId);
    const vector = parseVector(embedding.vector);
    if (!mainText || !vector) continue;
    rows.push({ id: embedding.ownerId, mainText, vector });
  }
  return rows;
}

export function rankSimilar(
  queryVector: number[],
  rows: EntryVectorRow[],
  k = SIMILARITY_TOP_K,
): SimilarCandidate[] {
  return topKByCosine(queryVector, rows, k).map(({ id, mainText, score }) => ({
    id,
    mainText,
    score,
  }));
}

export async function findSimilarEntries(
  queryText: string,
  options?: { excludeId?: string; k?: number },
): Promise<{
  vector: number[];
  textHash: string;
  candidates: SimilarCandidate[];
}> {
  const trimmed = queryText.trim();
  const [vector] = await embedTexts([trimmed]);
  if (!vector) {
    throw new Error("Failed to embed query text");
  }
  const index = await loadEntryVectorIndex(options?.excludeId);
  return {
    vector,
    textHash: hashEmbeddingText(trimmed),
    candidates: rankSimilar(vector, index, options?.k),
  };
}

export async function loadSatzVectorIndex(
  excludeId?: string,
): Promise<EntryVectorRow[]> {
  const embeddings = await db.embedding.findMany({
    where: {
      ownerType: EmbeddingOwnerType.SATZ,
      ...(excludeId ? { ownerId: { not: excludeId } } : {}),
    },
  });
  if (embeddings.length === 0) return [];

  const saetze = await db.satz.findMany({
    where: { id: { in: embeddings.map((e) => e.ownerId) } },
    select: { id: true, mainText: true },
  });
  const textById = new Map(saetze.map((s) => [s.id, s.mainText]));

  const rows: EntryVectorRow[] = [];
  for (const embedding of embeddings) {
    const mainText = textById.get(embedding.ownerId);
    const vector = parseVector(embedding.vector);
    if (!mainText || !vector) continue;
    rows.push({ id: embedding.ownerId, mainText, vector });
  }
  return rows;
}

export async function findSimilarSaetze(
  queryText: string,
  options?: { excludeId?: string; k?: number },
): Promise<{
  vector: number[];
  textHash: string;
  candidates: SimilarCandidate[];
}> {
  const trimmed = queryText.trim();
  const [vector] = await embedTexts([trimmed]);
  if (!vector) {
    throw new Error("Failed to embed query text");
  }
  const index = await loadSatzVectorIndex(options?.excludeId);
  return {
    vector,
    textHash: hashEmbeddingText(trimmed),
    candidates: rankSimilar(vector, index, options?.k),
  };
}

export async function loadQuestionVectorIndex(
  excludeId?: string,
): Promise<EntryVectorRow[]> {
  const rows = await loadSatzVectorIndex(excludeId);
  return rows.filter((row) => looksLikeQuestion(row.mainText));
}

export async function findSimilarQuestions(
  queryText: string,
  options?: { excludeId?: string; k?: number },
): Promise<{
  vector: number[];
  candidates: SimilarCandidate[];
  flagged: SimilarCandidate[];
}> {
  const trimmed = queryText.trim();
  const [vector] = await embedTexts([trimmed]);
  if (!vector) {
    throw new Error("Failed to embed question text");
  }
  const index = await loadQuestionVectorIndex(options?.excludeId);
  const candidates = rankSimilar(
    vector,
    index,
    options?.k ?? QUESTION_MATCH_TOP_K,
  );
  return {
    vector,
    candidates,
    flagged: filterByThreshold(candidates, QUESTION_MATCH_THRESHOLD),
  };
}

export function rankVocabForSentence(
  queryVector: number[],
  rows: EntryVectorRow[],
  k = VOCAB_LINK_TOP_K,
  minScore = VOCAB_LINK_MIN_SCORE,
): SimilarCandidate[] {
  return filterByThreshold(rankSimilar(queryVector, rows, k), minScore);
}

export async function saveEntryEmbedding(
  entryId: string,
  vector: number[],
  textHash: string,
  client: DbClient = db,
): Promise<void> {
  await client.embedding.upsert({
    where: {
      ownerType_ownerId: {
        ownerType: EmbeddingOwnerType.ENTRY,
        ownerId: entryId,
      },
    },
    create: {
      ownerType: EmbeddingOwnerType.ENTRY,
      ownerId: entryId,
      model: EMBEDDING_MODEL,
      dims: vector.length,
      vector: vector as Prisma.InputJsonValue,
      textHash,
    },
    update: {
      model: EMBEDDING_MODEL,
      dims: vector.length,
      vector: vector as Prisma.InputJsonValue,
      textHash,
    },
  });
}

export async function upsertEntryEmbedding(
  entryId: string,
  mainText: string,
  client: DbClient = db,
): Promise<{ skipped: boolean }> {
  const textHash = hashEmbeddingText(mainText);
  const existing = await client.embedding.findUnique({
    where: {
      ownerType_ownerId: {
        ownerType: EmbeddingOwnerType.ENTRY,
        ownerId: entryId,
      },
    },
  });
  if (
    existing &&
    existing.textHash === textHash &&
    existing.model === EMBEDDING_MODEL
  ) {
    return { skipped: true };
  }

  const [vector] = await embedTexts([mainText]);
  if (!vector) {
    throw new Error("Failed to embed entry text");
  }
  await saveEntryEmbedding(entryId, vector, textHash, client);
  return { skipped: false };
}

export async function deleteEntryEmbedding(
  entryId: string,
  client: DbClient = db,
): Promise<void> {
  await client.embedding.deleteMany({
    where: {
      ownerType: EmbeddingOwnerType.ENTRY,
      ownerId: entryId,
    },
  });
}

export async function saveSatzEmbedding(
  satzId: string,
  vector: number[],
  textHash: string,
  client: DbClient = db,
): Promise<void> {
  await client.embedding.upsert({
    where: {
      ownerType_ownerId: {
        ownerType: EmbeddingOwnerType.SATZ,
        ownerId: satzId,
      },
    },
    create: {
      ownerType: EmbeddingOwnerType.SATZ,
      ownerId: satzId,
      model: EMBEDDING_MODEL,
      dims: vector.length,
      vector: vector as Prisma.InputJsonValue,
      textHash,
    },
    update: {
      model: EMBEDDING_MODEL,
      dims: vector.length,
      vector: vector as Prisma.InputJsonValue,
      textHash,
    },
  });
}

export async function upsertSatzEmbedding(
  satzId: string,
  mainText: string,
  client: DbClient = db,
): Promise<{ skipped: boolean }> {
  const textHash = hashEmbeddingText(mainText);
  const existing = await client.embedding.findUnique({
    where: {
      ownerType_ownerId: {
        ownerType: EmbeddingOwnerType.SATZ,
        ownerId: satzId,
      },
    },
  });
  if (
    existing &&
    existing.textHash === textHash &&
    existing.model === EMBEDDING_MODEL
  ) {
    return { skipped: true };
  }

  const [vector] = await embedTexts([mainText]);
  if (!vector) {
    throw new Error("Failed to embed satz text");
  }
  await saveSatzEmbedding(satzId, vector, textHash, client);
  return { skipped: false };
}

export async function deleteSatzEmbedding(
  satzId: string,
  client: DbClient = db,
): Promise<void> {
  await client.embedding.deleteMany({
    where: {
      ownerType: EmbeddingOwnerType.SATZ,
      ownerId: satzId,
    },
  });
}

export async function assessNewEntrySimilarity(params: {
  mainText: string;
  allowSimilar?: boolean;
  queryVector?: number[];
  textHash?: string;
  extraCandidates?: EntryVectorRow[];
  excludeId?: string;
}): Promise<{
  vector: number[];
  textHash: string;
  blocked: boolean;
  candidates: SimilarCandidate[];
}> {
  const trimmed = params.mainText.trim();
  const textHash = params.textHash ?? hashEmbeddingText(trimmed);
  let vector = params.queryVector;
  if (!vector) {
    const [embedded] = await embedTexts([trimmed]);
    vector = embedded;
  }
  if (!vector) {
    throw new Error("Failed to embed entry text");
  }

  const index = [
    ...(await loadEntryVectorIndex(params.excludeId)),
    ...(params.extraCandidates ?? []),
  ];
  const ranked = rankSimilar(vector, index);
  const flagged = filterByThreshold(ranked, SIMILARITY_THRESHOLD);

  if (flagged.length === 0 || params.allowSimilar) {
    return { vector, textHash, blocked: false, candidates: ranked };
  }

  let llmMatchId: string | null = null;
  try {
    const verdict = await judgeSemanticDuplicates({
      queryText: trimmed,
      candidates: flagged,
    });
    if (verdict.isDuplicate) {
      llmMatchId = verdict.matchId ?? flagged[0]?.id ?? null;
    }
  } catch (error) {
    console.error("Duplicate judge failed, treating as similar:", error);
    llmMatchId = flagged[0]?.id ?? null;
  }

  if (!llmMatchId) {
    return { vector, textHash, blocked: false, candidates: ranked };
  }

  const candidates = flagged.map((c) => ({
    ...c,
    llmMatch: c.id === llmMatchId,
  }));

  return { vector, textHash, blocked: true, candidates };
}

export async function assessNewSatzSimilarity(params: {
  mainText: string;
  allowSimilar?: boolean;
  queryVector?: number[];
  extraCandidates?: EntryVectorRow[];
  excludeId?: string;
}): Promise<{
  vector: number[];
  textHash: string;
  blocked: boolean;
  candidates: SimilarCandidate[];
}> {
  const trimmed = params.mainText.trim();
  const textHash = hashEmbeddingText(trimmed);
  let vector = params.queryVector;
  if (!vector) {
    const [embedded] = await embedTexts([trimmed]);
    vector = embedded;
  }
  if (!vector) {
    throw new Error("Failed to embed satz text");
  }

  const index = [
    ...(await loadSatzVectorIndex(params.excludeId)),
    ...(params.extraCandidates ?? []),
  ];
  const ranked = rankSimilar(vector, index);
  const flagged = filterByThreshold(ranked, SIMILARITY_THRESHOLD);

  if (flagged.length === 0 || params.allowSimilar) {
    return { vector, textHash, blocked: false, candidates: ranked };
  }

  let llmMatchId: string | null = null;
  try {
    const verdict = await judgeSemanticDuplicates({
      queryText: trimmed,
      candidates: flagged,
      kind: "satz",
    });
    if (verdict.isDuplicate) {
      llmMatchId = verdict.matchId ?? flagged[0]?.id ?? null;
    }
  } catch (error) {
    console.error("Satz duplicate judge failed, treating as similar:", error);
    llmMatchId = flagged[0]?.id ?? null;
  }

  if (!llmMatchId) {
    return { vector, textHash, blocked: false, candidates: ranked };
  }

  return {
    vector,
    textHash,
    blocked: true,
    candidates: flagged.map((c) => ({
      ...c,
      llmMatch: c.id === llmMatchId,
    })),
  };
}

export async function getEmbeddingStatus(): Promise<{
  total: number;
  withEmbedding: number;
  missing: number;
  model: string;
  dims: number;
  threshold: number;
}> {
  const total = await db.entry.count();
  const withEmbedding = await db.embedding.count({
    where: {
      ownerType: EmbeddingOwnerType.ENTRY,
      model: EMBEDDING_MODEL,
    },
  });
  return {
    total,
    withEmbedding,
    missing: Math.max(0, total - withEmbedding),
    model: EMBEDDING_MODEL,
    dims: EMBEDDING_DIMS,
    threshold: SIMILARITY_THRESHOLD,
  };
}

export async function backfillEntryEmbeddings(limit: number): Promise<{
  processed: number;
  skipped: number;
  remaining: number;
  total: number;
  withEmbedding: number;
}> {
  const existing = await db.embedding.findMany({
    where: {
      ownerType: EmbeddingOwnerType.ENTRY,
      model: EMBEDDING_MODEL,
    },
    select: { ownerId: true, textHash: true },
  });
  const hashById = new Map(existing.map((e) => [e.ownerId, e.textHash]));

  const entries = await db.entry.findMany({
    select: { id: true, mainText: true },
    orderBy: { createdAt: "asc" },
  });

  const stale = entries.filter((entry) => {
    const hash = hashById.get(entry.id);
    return !hash || hash !== hashEmbeddingText(entry.mainText);
  });

  const batch = stale.slice(0, limit);
  let skipped = 0;

  if (batch.length > 0) {
    const vectors = await embedTexts(batch.map((e) => e.mainText));
    for (let i = 0; i < batch.length; i++) {
      const entry = batch[i]!;
      const vector = vectors[i];
      if (!vector) {
        skipped += 1;
        continue;
      }
      await saveEntryEmbedding(
        entry.id,
        vector,
        hashEmbeddingText(entry.mainText),
      );
    }
  }

  const status = await getEmbeddingStatus();
  return {
    processed: batch.length - skipped,
    skipped,
    remaining: Math.max(0, stale.length - batch.length),
    total: status.total,
    withEmbedding: status.withEmbedding,
  };
}

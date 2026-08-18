import {
  AudioStatus,
  DomainKind,
  Prisma,
  SatzImportBatchStatus,
  SatzImportItemStatus,
  SatzPriority,
  SatzRegister,
  SatzSource,
  ShadowingStatus,
} from "@prisma/client";
import { SOURCE_LANG, TARGET_LANGS } from "~/lib/languages";
import { normalizeSatzText, parseSatzCsv } from "~/lib/satz-csv";
import {
  isDraftReadyToCommit,
  parseDraftCandidates,
  parseDraftTranslations,
  parsePriority,
  parseRegister,
  parseSource,
  parseStringIds,
  resolveThemeNames,
  type DraftCandidate,
  type DraftTranslation,
} from "~/lib/satz-import";
import { db } from "~/server/db";
import { ensureCanonicalDomainsOnce } from "~/server/services/domains";
import {
  assessNewSatzSimilarity,
  embedTexts,
  loadEntryVectorIndex,
  rankVocabForSentence,
  upsertSatzEmbedding,
} from "~/server/services/embeddings";
import { enrichSatzImport } from "~/server/services/openai";

type DbClient = typeof db | Prisma.TransactionClient;

const SATZ_DOMAIN_KINDS: DomainKind[] = [DomainKind.THEME, DomainKind.SPECIAL];

export async function createBatchFromCsv(params: {
  csvText: string;
  filename?: string;
}) {
  const parsed = parseSatzCsv(params.csvText);
  if (parsed.rows.length === 0) {
    throw new Error("CSV_EMPTY");
  }

  const existing = await db.satz.findMany({
    select: { id: true, mainText: true },
  });
  const existingByNorm = new Map(
    existing.map((satz) => [normalizeSatzText(satz.mainText), satz]),
  );

  const seen = new Map<string, { rowNumber: number }>();

  const drafts = parsed.rows.map((row) => {
    const norm = normalizeSatzText(row.mainText);
    const fileDup = seen.get(norm);
    const dbMatch = existingByNorm.get(norm);
    if (!fileDup) seen.set(norm, { rowNumber: row.rowNumber });

    if (fileDup || dbMatch) {
      const candidates: DraftCandidate[] = dbMatch
        ? [{ id: dbMatch.id, mainText: dbMatch.mainText, score: 1, llmMatch: true }]
        : [];
      return {
        rowNumber: row.rowNumber,
        mainText: row.mainText.trim(),
        status: SatzImportItemStatus.SKIPPED_DUPLICATE,
        isDuplicate: true,
        duplicateCandidates: candidates as Prisma.InputJsonValue,
        error: fileDup
          ? `Exact duplicate of row ${fileDup.rowNumber}`
          : "Exact duplicate of an existing sentence",
      };
    }

    return {
      rowNumber: row.rowNumber,
      mainText: row.mainText.trim(),
      status: SatzImportItemStatus.PENDING,
      isDuplicate: false,
    };
  });

  const pendingCount = drafts.filter(
    (d) => d.status === SatzImportItemStatus.PENDING,
  ).length;

  return db.satzImportBatch.create({
    data: {
      filename: params.filename?.trim() || null,
      status:
        pendingCount === 0
          ? SatzImportBatchStatus.REVIEW
          : SatzImportBatchStatus.UPLOADED,
      items: { create: drafts },
    },
  });
}

async function loadThemeDomains() {
  await ensureCanonicalDomainsOnce(db);
  return db.domain.findMany({
    where: { kind: DomainKind.THEME },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

async function enrichOneDraft(
  draft: { id: string; mainText: string },
  entryIndex: Awaited<ReturnType<typeof loadEntryVectorIndex>>,
  themes: Array<{ id: string; name: string }>,
) {
  const [vector] = await embedTexts([draft.mainText]);
  if (!vector) {
    throw new Error("Failed to embed satz text");
  }

  const similarity = await assessNewSatzSimilarity({
    mainText: draft.mainText,
    queryVector: vector,
  });

  if (similarity.blocked) {
    await db.satzImportDraft.update({
      where: { id: draft.id },
      data: {
        status: SatzImportItemStatus.SKIPPED_DUPLICATE,
        isDuplicate: true,
        duplicateCandidates: similarity.candidates as Prisma.InputJsonValue,
        vocabCandidates: rankVocabForSentence(
          vector,
          entryIndex,
        ) as Prisma.InputJsonValue,
      },
    });
    return;
  }

  const vocabCandidates = rankVocabForSentence(vector, entryIndex);
  const enriched = await enrichSatzImport({
    germanText: draft.mainText,
    targetLangs: TARGET_LANGS.map((l) => l.code),
    themeNames: themes.map((t) => t.name),
    vocabCandidates,
  });

  const register = parseRegister(enriched.register);
  const translations: DraftTranslation[] = Object.entries(enriched.translations).map(
    ([lang, text]) => ({ lang, text, register }),
  );
  const domainIds = resolveThemeNames(enriched.themeNames ?? [], themes);
  const linkedEntryIds = (enriched.linkedEntryIds ?? []).filter((id) =>
    vocabCandidates.some((c) => c.id === id),
  );

  await db.satzImportDraft.update({
    where: { id: draft.id },
    data: {
      status: SatzImportItemStatus.ENRICHED,
      isDuplicate: false,
      trigger: enriched.trigger?.trim() || null,
      priority: parsePriority(enriched.priority),
      register,
      translations: translations as Prisma.InputJsonValue,
      domainIds: domainIds as Prisma.InputJsonValue,
      linkedEntryIds: linkedEntryIds as Prisma.InputJsonValue,
      duplicateCandidates: similarity.candidates as Prisma.InputJsonValue,
      vocabCandidates: vocabCandidates as Prisma.InputJsonValue,
      error: null,
    },
  });
}

export async function enrichNextDrafts(batchId: string, limit: number) {
  const batch = await db.satzImportBatch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true },
  });
  if (!batch) {
    throw new Error("Satz import batch not found");
  }
  if (batch.status === SatzImportBatchStatus.COMMITTED) {
    throw new Error("Satz import batch already committed");
  }

  const pending = await db.satzImportDraft.findMany({
    where: { batchId, status: SatzImportItemStatus.PENDING },
    orderBy: { rowNumber: "asc" },
    take: limit,
    select: { id: true, mainText: true },
  });

  if (pending.length === 0) {
    await db.satzImportBatch.update({
      where: { id: batchId },
      data: { status: SatzImportBatchStatus.REVIEW, error: null },
    });
    return { processed: 0, remaining: 0, status: SatzImportBatchStatus.REVIEW };
  }

  await db.satzImportBatch.update({
    where: { id: batchId },
    data: { status: SatzImportBatchStatus.ENRICHING, error: null },
  });

  const [entryIndex, themes] = await Promise.all([
    loadEntryVectorIndex(),
    loadThemeDomains(),
  ]);

  let processed = 0;
  for (const draft of pending) {
    try {
      await enrichOneDraft(draft, entryIndex, themes);
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Satz import enrich failed:", error);
      await db.satzImportDraft.update({
        where: { id: draft.id },
        data: {
          status: SatzImportItemStatus.ERROR,
          error: message,
        },
      });
    }
  }

  const remaining = await db.satzImportDraft.count({
    where: { batchId, status: SatzImportItemStatus.PENDING },
  });
  const nextStatus =
    remaining === 0
      ? SatzImportBatchStatus.REVIEW
      : SatzImportBatchStatus.ENRICHING;

  await db.satzImportBatch.update({
    where: { id: batchId },
    data: { status: nextStatus },
  });

  return { processed, remaining, status: nextStatus };
}

export type DraftUpdateInput = {
  skip?: boolean;
  allowSimilar?: boolean;
  trigger?: string | null;
  source?: SatzSource;
  priority?: SatzPriority;
  register?: SatzRegister;
  translations?: DraftTranslation[];
  domainIds?: string[];
  linkedEntryIds?: string[];
};

export async function updateImportDraft(id: string, input: DraftUpdateInput) {
  const existing = await db.satzImportDraft.findUnique({
    where: { id },
    include: { batch: { select: { status: true } } },
  });
  if (!existing) {
    throw new Error("Satz import draft not found");
  }
  if (existing.status === SatzImportItemStatus.COMMITTED) {
    throw new Error("Satz import draft already committed");
  }
  if (existing.batch.status === SatzImportBatchStatus.COMMITTED) {
    throw new Error("Satz import batch already committed");
  }

  if (input.domainIds) {
    await assertAssignableDomainIds(db, input.domainIds);
  }
  if (input.linkedEntryIds) {
    await assertEntryIds(db, input.linkedEntryIds);
  }

  const register = input.register ?? parseRegister(existing.register);
  let translationsUpdate: Prisma.InputJsonValue | undefined;
  if (input.translations) {
    translationsUpdate = input.translations.map((t) => ({
      lang: t.lang,
      text: t.text.trim(),
      register: t.register ?? register,
    }));
  } else if (input.register) {
    translationsUpdate = parseDraftTranslations(existing.translations).map((t) => ({
      ...t,
      register: input.register!,
    }));
  }

  const updated = await db.satzImportDraft.update({
    where: { id },
    data: {
      ...(input.skip !== undefined && { skip: input.skip }),
      ...(input.allowSimilar !== undefined && { allowSimilar: input.allowSimilar }),
      ...(input.trigger !== undefined && {
        trigger: input.trigger?.trim() || null,
      }),
      ...(input.source && { source: input.source }),
      ...(input.priority && { priority: input.priority }),
      ...(input.register && { register: input.register }),
      ...(translationsUpdate !== undefined && { translations: translationsUpdate }),
      ...(input.domainIds && {
        domainIds: input.domainIds as Prisma.InputJsonValue,
      }),
      ...(input.linkedEntryIds && {
        linkedEntryIds: input.linkedEntryIds as Prisma.InputJsonValue,
      }),
    },
  });
  await maybeCloseBatch(existing.batchId);
  return updated;
}

async function maybeCloseBatch(batchId: string) {
  const remainingOpen = await db.satzImportDraft.count({
    where: {
      batchId,
      status: { notIn: [SatzImportItemStatus.COMMITTED] },
      skip: false,
    },
  });
  if (remainingOpen === 0) {
    await db.satzImportBatch.update({
      where: { id: batchId },
      data: { status: SatzImportBatchStatus.COMMITTED },
    });
  }
}

async function assertAssignableDomainIds(client: DbClient, domainIds: string[]) {
  if (domainIds.length === 0) return;
  const domains = await client.domain.findMany({
    where: { id: { in: domainIds } },
    select: { id: true, kind: true, name: true },
  });
  if (domains.length !== domainIds.length) {
    throw new Error("One or more domains were not found");
  }
  const invalid = domains.filter((d) => !SATZ_DOMAIN_KINDS.includes(d.kind));
  if (invalid.length > 0) {
    throw new Error(
      `Sätze can only be assigned to THEME or SPECIAL domains (not: ${invalid.map((d) => d.name).join(", ")})`,
    );
  }
}

async function assertEntryIds(client: DbClient, entryIds: string[]) {
  if (entryIds.length === 0) return;
  const count = await client.entry.count({ where: { id: { in: entryIds } } });
  if (count !== entryIds.length) {
    throw new Error("One or more entries were not found");
  }
}

async function persistSatzEmbeddingSafe(satzId: string, mainText: string) {
  try {
    await upsertSatzEmbedding(satzId, mainText);
  } catch (error) {
    console.error("Satz embedding failed:", error);
  }
}

export async function commitImportBatch(batchId: string, draftIds?: string[]) {
  const batch = await db.satzImportBatch.findUnique({
    where: { id: batchId },
    include: { items: { orderBy: { rowNumber: "asc" } } },
  });
  if (!batch) {
    throw new Error("Satz import batch not found");
  }
  if (batch.status === SatzImportBatchStatus.COMMITTED) {
    throw new Error("Satz import batch already committed");
  }

  const wanted = draftIds ? new Set(draftIds) : null;
  const ready = batch.items.filter(
    (item) =>
      (!wanted || wanted.has(item.id)) && isDraftReadyToCommit(item),
  );
  if (ready.length === 0) {
    throw new Error("SATZ_IMPORT_NOTHING_TO_COMMIT");
  }

  const created: string[] = [];

  for (const draft of ready) {
    const translations = parseDraftTranslations(draft.translations);
    const domainIds = parseStringIds(draft.domainIds);
    const linkedEntryIds = parseStringIds(draft.linkedEntryIds);
    await assertAssignableDomainIds(db, domainIds);
    await assertEntryIds(db, linkedEntryIds);

    const satz = await db.satz.create({
      data: {
        mainLang: SOURCE_LANG.code,
        mainText: draft.mainText.trim(),
        trigger: draft.trigger?.trim() || null,
        source: parseSource(draft.source),
        priority: draft.priority,
        shadowingStatus: ShadowingStatus.NOT_STARTED,
        translations: {
          create: translations.map((t) => ({
            lang: t.lang,
            text: t.text,
            register: t.register,
            audioStatus: AudioStatus.NONE,
          })),
        },
        ...(domainIds.length > 0 && {
          domains: { create: domainIds.map((domainId) => ({ domainId })) },
        }),
        ...(linkedEntryIds.length > 0 && {
          linkedEntries: {
            create: linkedEntryIds.map((entryId) => ({ entryId })),
          },
        }),
      },
    });

    await persistSatzEmbeddingSafe(satz.id, satz.mainText);
    await db.satzImportDraft.update({
      where: { id: draft.id },
      data: {
        status: SatzImportItemStatus.COMMITTED,
        committedSatzId: satz.id,
        skip: false,
      },
    });
    created.push(satz.id);
  }

  const remainingOpen = await db.satzImportDraft.count({
    where: {
      batchId,
      status: {
        notIn: [SatzImportItemStatus.COMMITTED],
      },
      skip: false,
    },
  });

  const nextStatus =
    remainingOpen === 0
      ? SatzImportBatchStatus.COMMITTED
      : SatzImportBatchStatus.REVIEW;

  await db.satzImportBatch.update({
    where: { id: batchId },
    data: { status: nextStatus },
  });

  return {
    createdCount: created.length,
    createdIds: created,
    status: nextStatus,
  };
}

export async function getBatchView(batchId: string) {
  const batch = await db.satzImportBatch.findUnique({
    where: { id: batchId },
    include: { items: { orderBy: { rowNumber: "asc" } } },
  });
  if (!batch) {
    throw new Error("Satz import batch not found");
  }

  const domainIds = [
    ...new Set(batch.items.flatMap((item) => parseStringIds(item.domainIds))),
  ];
  const entryIds = [
    ...new Set(
      batch.items.flatMap((item) => [
        ...parseStringIds(item.linkedEntryIds),
        ...parseDraftCandidates(item.vocabCandidates).map((c) => c.id),
      ]),
    ),
  ];

  const [domains, entries] = await Promise.all([
    domainIds.length
      ? db.domain.findMany({
          where: { id: { in: domainIds } },
          select: { id: true, name: true, kind: true },
        })
      : Promise.resolve([]),
    entryIds.length
      ? db.entry.findMany({
          where: { id: { in: entryIds } },
          select: { id: true, mainText: true },
        })
      : Promise.resolve([]),
  ]);
  const domainById = new Map(domains.map((d) => [d.id, d]));
  const entryById = new Map(entries.map((e) => [e.id, e]));

  const items = batch.items.map((item) => {
    const translations = parseDraftTranslations(item.translations);
    const linkedIds = parseStringIds(item.linkedEntryIds);
    const domainIdList = parseStringIds(item.domainIds);
    return {
      id: item.id,
      rowNumber: item.rowNumber,
      mainText: item.mainText,
      status: item.status,
      skip: item.skip,
      trigger: item.trigger,
      source: item.source,
      priority: item.priority,
      register: item.register,
      translations,
      domainIds: domainIdList,
      domains: domainIdList
        .map((id) => domainById.get(id))
        .filter((d): d is NonNullable<typeof d> => Boolean(d)),
      linkedEntryIds: linkedIds,
      linkedEntries: linkedIds
        .map((id) => entryById.get(id))
        .filter((e): e is NonNullable<typeof e> => Boolean(e)),
      vocabCandidates: parseDraftCandidates(item.vocabCandidates).map((c) => ({
        ...c,
        mainText: entryById.get(c.id)?.mainText ?? c.mainText,
      })),
      duplicateCandidates: parseDraftCandidates(item.duplicateCandidates),
      isDuplicate: item.isDuplicate,
      allowSimilar: item.allowSimilar,
      error: item.error,
      committedSatzId: item.committedSatzId,
      ready: isDraftReadyToCommit(item),
    };
  });

  const counts = {
    total: items.length,
    pending: items.filter((i) => i.status === SatzImportItemStatus.PENDING).length,
    enriched: items.filter((i) => i.status === SatzImportItemStatus.ENRICHED).length,
    skippedDuplicate: items.filter(
      (i) => i.status === SatzImportItemStatus.SKIPPED_DUPLICATE,
    ).length,
    error: items.filter((i) => i.status === SatzImportItemStatus.ERROR).length,
    committed: items.filter((i) => i.status === SatzImportItemStatus.COMMITTED)
      .length,
    skippedByUser: items.filter((i) => i.skip).length,
    ready: items.filter((i) => i.ready).length,
  };

  return {
    id: batch.id,
    filename: batch.filename,
    status: batch.status,
    error: batch.error,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    counts,
    items,
  };
}

import {
  AudioStatus,
  DomainKind,
  MediaKind,
  Prisma,
  SatzImportBatchStatus,
  SatzImportItemStatus,
  SatzPriority,
  SatzRegister,
  SatzSource,
  ShadowingStatus,
} from "@prisma/client";
import { resolveImportTargetLang, SOURCE_LANG } from "~/lib/languages";
import { normalizeSatzText, parseSatzCsv } from "~/lib/satz-csv";
import {
  isDraftReadyToCommit,
  parseDraftCandidates,
  parseDraftTranslations,
  translationsForLang,
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
import { resolveAnswerQuestion } from "~/server/services/satz-question";
import { assertMediaWorkId, ensureMediaWork } from "~/server/services/media-work";

type DbClient = typeof db | Prisma.TransactionClient;

const SATZ_DOMAIN_KINDS: DomainKind[] = [DomainKind.THEME, DomainKind.SPECIAL];

export async function createBatchFromCsv(params: {
  csvText: string;
  filename?: string;
  targetLang?: string;
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

  const targetLang = resolveImportTargetLang(params.targetLang);
  const seen = new Map<string, { rowNumber: number }>();
  const mediaIdByKey = new Map<string, string>();

  const drafts = [];
  for (const row of parsed.rows) {
    const norm = normalizeSatzText(row.mainText);
    const fileDup = seen.get(norm);
    const dbMatch = existingByNorm.get(norm);
    if (!fileDup) seen.set(norm, { rowNumber: row.rowNumber });

    const translations = [
      {
        lang: targetLang,
        text: row.translation.trim(),
        register: SatzRegister.INFORMAL,
      },
    ] as Prisma.InputJsonValue;

    let mediaWorkId: string | undefined;
    if (row.mediaKind && row.mediaTitle) {
      const key = `${row.mediaKind}:${row.mediaTitle.trim().toLowerCase()}`;
      const cached = mediaIdByKey.get(key);
      if (cached) {
        mediaWorkId = cached;
      } else {
        const work = await ensureMediaWork({
          kind: row.mediaKind as MediaKind,
          title: row.mediaTitle,
          creator: row.mediaCreator,
          url: row.mediaUrl,
          year: row.mediaYear,
        });
        mediaIdByKey.set(key, work.id);
        mediaWorkId = work.id;
      }
    }

    if (fileDup || dbMatch) {
      const candidates: DraftCandidate[] = dbMatch
        ? [{ id: dbMatch.id, mainText: dbMatch.mainText, score: 1, llmMatch: true }]
        : [];
      drafts.push({
        rowNumber: row.rowNumber,
        mainText: row.mainText.trim(),
        translations,
        status: SatzImportItemStatus.SKIPPED_DUPLICATE,
        isDuplicate: true,
        duplicateCandidates: candidates as Prisma.InputJsonValue,
        ...(mediaWorkId && { mediaWorkId }),
        error: fileDup
          ? `Exact duplicate of row ${fileDup.rowNumber}`
          : "Exact duplicate of an existing sentence",
      });
      continue;
    }

    drafts.push({
      rowNumber: row.rowNumber,
      mainText: row.mainText.trim(),
      translations,
      status: SatzImportItemStatus.PENDING,
      isDuplicate: false,
      ...(mediaWorkId && { mediaWorkId }),
    });
  }

  return db.satzImportBatch.create({
    data: {
      filename: params.filename?.trim() || null,
      targetLang: targetLang,
      status: SatzImportBatchStatus.UPLOADED,
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

function csvTranslationsWithRegister(
  value: unknown,
  register: SatzRegister,
): DraftTranslation[] {
  const existing = parseDraftTranslations(value);
  if (existing.length === 0) return existing;
  return existing.map((item) => ({ ...item, register }));
}

async function enrichOneDraft(
  draft: { id: string; mainText: string; translations: Prisma.JsonValue | null },
  entryIndex: Awaited<ReturnType<typeof loadEntryVectorIndex>>,
  themes: Array<{ id: string; name: string }>,
  targetLang: string,
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

  const csvTranslations = parseDraftTranslations(draft.translations);
  const translationText =
    csvTranslations.find((item) => item.lang === targetLang)?.text ??
    csvTranslations[0]?.text ??
    "";

  const vocabCandidates = rankVocabForSentence(vector, entryIndex);
  const enriched = await enrichSatzImport({
    germanText: draft.mainText,
    translationText,
    targetLang,
    themeNames: themes.map((t) => t.name),
    vocabCandidates,
  });

  const register = parseRegister(enriched.register);
  const translations = csvTranslationsWithRegister(draft.translations, register);
  const domainIds = resolveThemeNames(enriched.themeNames ?? [], themes);
  const linkedEntryIds = (enriched.linkedEntryIds ?? []).filter((id) =>
    vocabCandidates.some((c) => c.id === id),
  );
  const qa = await resolveAnswerQuestion({
    mainText: draft.mainText,
    isAnswer: enriched.isAnswer,
    question: enriched.question,
    questionTranslations: enriched.questionTranslations,
    register,
  });

  await db.satzImportDraft.update({
    where: { id: draft.id },
    data: {
      status: SatzImportItemStatus.ENRICHED,
      isDuplicate: false,
      adjustedSource: enriched.adjustedSource ?? null,
      trigger: enriched.trigger?.trim() || null,
      priority: parsePriority(enriched.priority),
      register,
      translations: translations as Prisma.InputJsonValue,
      domainIds: domainIds as Prisma.InputJsonValue,
      linkedEntryIds: linkedEntryIds as Prisma.InputJsonValue,
      duplicateCandidates: similarity.candidates as Prisma.InputJsonValue,
      vocabCandidates: vocabCandidates as Prisma.InputJsonValue,
      isAnswer: qa.isAnswer,
      answerToId: qa.matchId,
      suggestedQuestionText: qa.suggestedQuestionText,
      questionTranslations: qa.questionTranslations as Prisma.InputJsonValue,
      questionCandidates: qa.candidates as Prisma.InputJsonValue,
      error: null,
    },
  });
}

export async function enrichNextDrafts(batchId: string, limit: number) {
  const batch = await db.satzImportBatch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true, targetLang: true },
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
    select: { id: true, mainText: true, translations: true },
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
      await enrichOneDraft(
        draft,
        entryIndex,
        themes,
        resolveImportTargetLang(batch.targetLang),
      );
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
  mainText?: string;
  adjustedSource?: string | null;
  skip?: boolean;
  allowSimilar?: boolean;
  trigger?: string | null;
  source?: SatzSource;
  priority?: SatzPriority;
  register?: SatzRegister;
  translations?: DraftTranslation[];
  domainIds?: string[];
  linkedEntryIds?: string[];
  isAnswer?: boolean;
  answerToId?: string | null;
  suggestedQuestionText?: string | null;
  questionTranslations?: DraftTranslation[];
  mediaWorkId?: string | null;
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
  if (input.answerToId) {
    await assertAnswerToId(db, input.answerToId);
  }
  if (input.mediaWorkId) {
    await assertMediaWorkId(input.mediaWorkId, db);
  }
  if (input.mainText !== undefined && !input.mainText.trim()) {
    throw new Error("CSV_EMPTY");
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
      ...(input.mainText !== undefined && { mainText: input.mainText.trim() }),
      // Manuelles Ändern des Quelltexts macht den Drift-Vorschlag obsolet.
      ...((input.adjustedSource !== undefined || input.mainText !== undefined) && {
        adjustedSource:
          input.adjustedSource !== undefined
            ? input.adjustedSource?.trim() || null
            : null,
      }),
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
      ...(input.isAnswer !== undefined && { isAnswer: input.isAnswer }),
      ...(input.answerToId !== undefined && { answerToId: input.answerToId }),
      ...(input.suggestedQuestionText !== undefined && {
        suggestedQuestionText: input.suggestedQuestionText?.trim() || null,
      }),
      ...(input.questionTranslations && {
        questionTranslations: input.questionTranslations as Prisma.InputJsonValue,
      }),
      ...(input.mediaWorkId !== undefined && { mediaWorkId: input.mediaWorkId }),
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

async function assertAnswerToId(client: DbClient, answerToId: string | null) {
  if (!answerToId) return;
  const question = await client.satz.findUnique({
    where: { id: answerToId },
    select: { id: true },
  });
  if (!question) {
    throw new Error("answerToId does not match an existing Satz");
  }
}

export async function applyMediaWorkToBatch(
  batchId: string,
  mediaWorkId: string | null,
) {
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
  if (mediaWorkId) {
    await assertMediaWorkId(mediaWorkId, db);
  }
  await db.satzImportDraft.updateMany({
    where: {
      batchId,
      status: { not: SatzImportItemStatus.COMMITTED },
    },
    data: { mediaWorkId },
  });
}

async function persistSatzEmbeddingSafe(satzId: string, mainText: string) {
  try {
    await upsertSatzEmbedding(satzId, mainText);
  } catch (error) {
    console.error("Satz embedding failed:", error);
  }
}

export async function commitImportBatch(
  batchId: string,
  options?: { draftIds?: string[]; limit?: number },
) {
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

  const targetLang = resolveImportTargetLang(batch.targetLang);
  const wanted = options?.draftIds ? new Set(options.draftIds) : null;
  const ready = batch.items.filter(
    (item) =>
      (!wanted || wanted.has(item.id)) && isDraftReadyToCommit(item),
  );
  if (ready.length === 0) {
    throw new Error("SATZ_IMPORT_NOTHING_TO_COMMIT");
  }

  const chunk = options?.limit ? ready.slice(0, options.limit) : ready;
  const created: string[] = [];
  const createdQuestions = new Map<string, string>();
  for (const item of batch.items) {
    if (item.status !== SatzImportItemStatus.COMMITTED) continue;
    const question = item.suggestedQuestionText?.trim();
    if (item.answerToId && question) {
      createdQuestions.set(normalizeSatzText(question), item.answerToId);
    }
  }

  for (const draft of chunk) {
    const translations = translationsForLang(draft.translations, targetLang);
    if (translations.length === 0) continue;
    const domainIds = parseStringIds(draft.domainIds);
    const linkedEntryIds = parseStringIds(draft.linkedEntryIds);
    await assertAssignableDomainIds(db, domainIds);
    await assertEntryIds(db, linkedEntryIds);

    let answerToId = draft.answerToId;
    const suggestedQuestion = draft.suggestedQuestionText?.trim();
    if (!answerToId && draft.isAnswer && suggestedQuestion) {
      const questionKey = normalizeSatzText(suggestedQuestion);
      const existingInBatch = createdQuestions.get(questionKey);
      if (existingInBatch) {
        answerToId = existingInBatch;
      } else {
        const questionTranslations = translationsForLang(
          draft.questionTranslations,
          targetLang,
        );
        if (questionTranslations.length > 0) {
          const question = await db.satz.create({
            data: {
              mainLang: SOURCE_LANG.code,
              mainText: suggestedQuestion,
              source: parseSource(draft.source),
              priority: draft.priority,
              shadowingStatus: ShadowingStatus.NOT_STARTED,
              translations: {
                create: questionTranslations.map((t) => ({
                  lang: t.lang,
                  text: t.text,
                  register: t.register,
                  audioStatus: AudioStatus.NONE,
                })),
              },
              ...(domainIds.length > 0 && {
                domains: { create: domainIds.map((domainId) => ({ domainId })) },
              }),
              ...(draft.mediaWorkId && { mediaWorkId: draft.mediaWorkId }),
            },
          });
          await persistSatzEmbeddingSafe(question.id, question.mainText);
          answerToId = question.id;
          createdQuestions.set(questionKey, question.id);
          created.push(question.id);
        }
      }
    }
    if (answerToId) {
      await assertAnswerToId(db, answerToId);
    }

    const satz = await db.satz.create({
      data: {
        mainLang: SOURCE_LANG.code,
        mainText: draft.mainText.trim(),
        trigger: draft.trigger?.trim() || null,
        source: parseSource(draft.source),
        priority: draft.priority,
        shadowingStatus: ShadowingStatus.NOT_STARTED,
        answerToId,
        mediaWorkId: draft.mediaWorkId,
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
        answerToId,
        skip: false,
      },
    });
    created.push(satz.id);
  }

  const remainingItems = await db.satzImportDraft.findMany({
    where: { batchId },
    select: {
      id: true,
      status: true,
      skip: true,
      isDuplicate: true,
      allowSimilar: true,
      translations: true,
    },
  });
  const remainingReady = remainingItems.filter((item) =>
    isDraftReadyToCommit(item),
  ).length;
  const remainingOpen = remainingItems.filter(
    (item) => item.status !== SatzImportItemStatus.COMMITTED && !item.skip,
  ).length;

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
    remaining: remainingReady,
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
  const answerToIds = [
    ...new Set(
      batch.items
        .map((item) => item.answerToId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const mediaWorkIds = [
    ...new Set(
      batch.items
        .map((item) => item.mediaWorkId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [domains, entries, questions, mediaWorks] = await Promise.all([
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
    answerToIds.length
      ? db.satz.findMany({
          where: { id: { in: answerToIds } },
          select: { id: true, mainText: true },
        })
      : Promise.resolve([]),
    mediaWorkIds.length
      ? db.mediaWork.findMany({
          where: { id: { in: mediaWorkIds } },
          select: {
            id: true,
            kind: true,
            title: true,
            creator: true,
            year: true,
            url: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const domainById = new Map(domains.map((d) => [d.id, d]));
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const mediaWorkById = new Map(mediaWorks.map((w) => [w.id, w]));

  const items = batch.items.map((item) => {
    const translations = parseDraftTranslations(item.translations);
    const linkedIds = parseStringIds(item.linkedEntryIds);
    const domainIdList = parseStringIds(item.domainIds);
    return {
      id: item.id,
      rowNumber: item.rowNumber,
      mainText: item.mainText,
      adjustedSource: item.adjustedSource,
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
      isAnswer: item.isAnswer,
      answerToId: item.answerToId,
      answerTo: item.answerToId ? questionById.get(item.answerToId) ?? null : null,
      suggestedQuestionText: item.suggestedQuestionText,
      questionTranslations: parseDraftTranslations(item.questionTranslations),
      questionCandidates: parseDraftCandidates(item.questionCandidates),
      error: item.error,
      committedSatzId: item.committedSatzId,
      mediaWorkId: item.mediaWorkId,
      mediaWork: item.mediaWorkId
        ? mediaWorkById.get(item.mediaWorkId) ?? null
        : null,
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
    new: items.filter((i) => !i.isDuplicate).length,
  };

  return {
    id: batch.id,
    filename: batch.filename,
    targetLang: resolveImportTargetLang(batch.targetLang),
    status: batch.status,
    error: batch.error,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    counts,
    items,
  };
}

import {
  AudioStatus,
  CardType,
  DailyItemType,
  DailyPackageStatus,
  DailyTestResult,
  WordCategory,
  type DailyPackage,
  type DailyPackageItem,
} from "@prisma/client";
import { isValidTense, personLabels, tenseLabel } from "~/lib/conjugation-catalog";
import {
  GRAMMAR_BONUS_FACTOR,
  LEECH_WEIGHT_FACTOR,
  dailyItemKey,
  interleaveByType,
  pickStratified,
  type DailyPackageConfig,
} from "~/lib/daily";
import {
  LEECH_SUCCESS_RATE,
  LEECH_WRONG_THRESHOLD,
} from "~/lib/gamification-config";
import {
  MIN_BOX,
  VOCAB_CARD_KEY,
  conjugationCardKey,
  scheduleNextReview,
} from "~/lib/leitner";
import {
  conjAudioPublicPath,
  playbackClips,
} from "~/lib/satz-tts";
import { db } from "~/server/db";
import {
  requestEntryAudio,
  requestParadigmAudio,
  requestSatzAudio,
} from "~/server/services/tts";

type Db = typeof db;

export type DailyCandidate = {
  itemType: DailyItemType;
  refId: string;
  refKey: string | null;
  domainId: string | null;
  grammarBonus: boolean;
  isRetry: boolean;
  isLeech: boolean;
  key: string;
  weight: number;
};

export type HydratedDailyItem = {
  id: string;
  itemType: DailyItemType;
  refId: string;
  refKey: string | null;
  position: number;
  testResult: DailyTestResult;
  grammarTopicBonusApplied: boolean;
  domain: { id: string; name: string } | null;
  nativeText: string;
  targetText: string;
  tenseLabel: string | null;
  forms: Array<{ personIndex: number; personLabel: string; form: string }>;
  audioStatus: AudioStatus;
  audioUrl: string | null;
  audioDurationMs: number | null;
  questionText: string | null;
  questionTranslation: string | null;
  questionClips: ReturnType<typeof playbackClips>;
  answerClips: ReturnType<typeof playbackClips>;
  clips: ReturnType<typeof playbackClips>;
};

function isLeechCounts(correctCount: number, wrongCount: number): boolean {
  const total = correctCount + wrongCount;
  const successRate = total > 0 ? correctCount / total : 0;
  return wrongCount >= LEECH_WRONG_THRESHOLD && successRate < LEECH_SUCCESS_RATE;
}

function candidateWeight(params: {
  grammarBonus: boolean;
  isLeech: boolean;
  isRetry: boolean;
}): number {
  let weight = 1;
  if (params.grammarBonus) weight *= GRAMMAR_BONUS_FACTOR;
  if (params.isLeech) weight *= LEECH_WEIGHT_FACTOR;
  if (params.isRetry) weight *= 8;
  return weight;
}

async function lastWrongKeys(
  prisma: Db,
  userId: string,
  targetLang: string,
): Promise<Set<string>> {
  const last = await prisma.dailyPackage.findFirst({
    where: {
      userId,
      targetLang,
      status: DailyPackageStatus.PRODUCTIVE,
    },
    orderBy: { completedAt: "desc" },
    include: {
      items: {
        where: { testResult: DailyTestResult.WRONG },
      },
    },
  });
  return new Set(
    (last?.items ?? []).map((item) =>
      dailyItemKey(item.itemType, item.refId, item.refKey),
    ),
  );
}

async function leechKeys(
  prisma: Db,
  userId: string,
  targetLang: string,
): Promise<Set<string>> {
  const [vocab, conj, satze] = await Promise.all([
    prisma.userProgress.findMany({
      where: {
        userId,
        targetLang,
        cardType: CardType.VOCAB,
        wrongCount: { gte: LEECH_WRONG_THRESHOLD },
      },
      select: { entryId: true, correctCount: true, wrongCount: true },
    }),
    prisma.userProgress.findMany({
      where: {
        userId,
        targetLang,
        cardType: CardType.CONJUGATION,
        wrongCount: { gte: LEECH_WRONG_THRESHOLD },
      },
      select: {
        entryId: true,
        cardKey: true,
        correctCount: true,
        wrongCount: true,
      },
    }),
    prisma.satzProgress.findMany({
      where: {
        userId,
        targetLang,
        wrongCount: { gte: LEECH_WRONG_THRESHOLD },
      },
      select: { satzId: true, correctCount: true, wrongCount: true },
    }),
  ]);

  const keys = new Set<string>();
  for (const row of vocab) {
    if (isLeechCounts(row.correctCount, row.wrongCount)) {
      keys.add(dailyItemKey(DailyItemType.ENTRY, row.entryId));
    }
  }
  for (const row of satze) {
    if (isLeechCounts(row.correctCount, row.wrongCount)) {
      keys.add(dailyItemKey(DailyItemType.SATZ, row.satzId));
    }
  }
  const conjLeeches = conj.filter((row) =>
    isLeechCounts(row.correctCount, row.wrongCount),
  );
  if (conjLeeches.length > 0) {
    const translations = await prisma.translation.findMany({
      where: {
        lang: targetLang,
        entryId: { in: [...new Set(conjLeeches.map((row) => row.entryId))] },
      },
      select: { id: true, entryId: true },
    });
    const translationIdByEntry = new Map(
      translations.map((row) => [row.entryId, row.id]),
    );
    for (const row of conjLeeches) {
      const tenseKey = row.cardKey.startsWith("conj:")
        ? row.cardKey.slice("conj:".length)
        : null;
      const translationId = translationIdByEntry.get(row.entryId);
      if (!tenseKey || !translationId) continue;
      keys.add(
        dailyItemKey(DailyItemType.CONJUGATION, translationId, tenseKey),
      );
    }
  }
  return keys;
}

export async function countNewPools(
  prisma: Db,
  userId: string,
  targetLang: string,
) {
  const [satz, vocab, conjGroups] = await Promise.all([
    prisma.satz.count({
      where: {
        translations: { some: { lang: targetLang } },
        progresses: { none: { userId, targetLang } },
      },
    }),
    prisma.entry.count({
      where: {
        translations: { some: { lang: targetLang } },
        progresses: {
          none: { userId, targetLang, cardType: CardType.VOCAB },
        },
      },
    }),
    loadNewConjugationCandidates(prisma, userId, targetLang),
  ]);
  return { satz, vocab, conj: conjGroups.length };
}

function satzIdsFromKeys(keys: Set<string>): string[] {
  return [...keys]
    .filter((key) => key.startsWith("SATZ:"))
    .map((key) => key.split(":")[1])
    .filter((id): id is string => Boolean(id));
}

async function loadNewSatzCandidates(
  prisma: Db,
  userId: string,
  targetLang: string,
  grammarTopicId: string | null,
  retryKeys: Set<string>,
  leechKeySet: Set<string>,
): Promise<DailyCandidate[]> {
  const extraIds = [
    ...new Set([
      ...satzIdsFromKeys(retryKeys),
      ...satzIdsFromKeys(leechKeySet),
    ]),
  ];
  const rows = await prisma.satz.findMany({
    where: {
      translations: { some: { lang: targetLang } },
      OR: [
        { progresses: { none: { userId, targetLang } } },
        ...(extraIds.length ? [{ id: { in: extraIds } }] : []),
      ],
    },
    select: {
      id: true,
      domains: { select: { domainId: true }, take: 1 },
      grammarTopics: { select: { grammarTopicId: true } },
    },
  });
  return rows.map((row) => {
    const key = dailyItemKey(DailyItemType.SATZ, row.id);
    const grammarBonus = Boolean(
      grammarTopicId &&
        row.grammarTopics.some((link) => link.grammarTopicId === grammarTopicId),
    );
    const isRetry = retryKeys.has(key);
    const isLeech = leechKeySet.has(key);
    return {
      itemType: DailyItemType.SATZ,
      refId: row.id,
      refKey: null,
      domainId: row.domains[0]?.domainId ?? null,
      grammarBonus,
      isRetry,
      isLeech,
      key,
      weight: candidateWeight({ grammarBonus, isRetry, isLeech }),
    };
  });
}

function entryIdsFromKeys(keys: Set<string>): string[] {
  return [...keys]
    .filter((key) => key.startsWith("ENTRY:"))
    .map((key) => key.split(":")[1])
    .filter((id): id is string => Boolean(id));
}

async function loadNewEntryCandidates(
  prisma: Db,
  userId: string,
  targetLang: string,
  retryKeys: Set<string>,
  leechKeySet: Set<string>,
): Promise<DailyCandidate[]> {
  const extraIds = [
    ...new Set([
      ...entryIdsFromKeys(retryKeys),
      ...entryIdsFromKeys(leechKeySet),
    ]),
  ];
  const rows = await prisma.entry.findMany({
    where: {
      translations: { some: { lang: targetLang } },
      OR: [
        {
          progresses: {
            none: { userId, targetLang, cardType: CardType.VOCAB },
          },
        },
        ...(extraIds.length ? [{ id: { in: extraIds } }] : []),
      ],
    },
    select: {
      id: true,
      domains: { select: { domainId: true }, take: 1 },
    },
  });
  return rows.map((row) => {
    const key = dailyItemKey(DailyItemType.ENTRY, row.id);
    const isRetry = retryKeys.has(key);
    const isLeech = leechKeySet.has(key);
    return {
      itemType: DailyItemType.ENTRY,
      refId: row.id,
      refKey: null,
      domainId: row.domains[0]?.domainId ?? null,
      grammarBonus: false,
      isRetry,
      isLeech,
      key,
      weight: candidateWeight({ grammarBonus: false, isRetry, isLeech }),
    };
  });
}

async function loadNewConjugationCandidates(
  prisma: Db,
  userId: string,
  targetLang: string,
): Promise<Array<{ translationId: string; entryId: string; tenseKey: string }>> {
  const forms = await prisma.conjugationForm.findMany({
    where: {
      translation: {
        lang: targetLang,
        entry: { category: WordCategory.VERB },
      },
    },
    select: {
      tenseKey: true,
      translationId: true,
      translation: { select: { entryId: true, lang: true } },
    },
    take: 4000,
  });

  const groups = new Map<
    string,
    { translationId: string; entryId: string; tenseKey: string }
  >();
  for (const form of forms) {
    if (!isValidTense(form.translation.lang, form.tenseKey)) continue;
    const key = `${form.translationId}:${form.tenseKey}`;
    if (!groups.has(key)) {
      groups.set(key, {
        translationId: form.translationId,
        entryId: form.translation.entryId,
        tenseKey: form.tenseKey,
      });
    }
  }

  const entryIds = [...new Set([...groups.values()].map((g) => g.entryId))];
  const progresses = await prisma.userProgress.findMany({
    where: {
      userId,
      targetLang,
      cardType: CardType.CONJUGATION,
      entryId: { in: entryIds },
    },
    select: { entryId: true, cardKey: true },
  });
  const progressed = new Set(
    progresses.map((row) => `${row.entryId}:${row.cardKey}`),
  );

  return [...groups.values()].filter(
    (group) =>
      !progressed.has(`${group.entryId}:${conjugationCardKey(group.tenseKey)}`),
  );
}

async function loadPriorityConjugationGroups(
  prisma: Db,
  targetLang: string,
  keys: Set<string>,
): Promise<Array<{ translationId: string; entryId: string; tenseKey: string }>> {
  const pairs = [...keys]
    .filter((key) => key.startsWith("CONJUGATION:"))
    .map((key) => {
      const parts = key.split(":");
      return { translationId: parts[1] ?? "", tenseKey: parts[2] ?? "" };
    })
    .filter((row) => row.translationId && row.tenseKey);
  if (pairs.length === 0) return [];
  const translations = await prisma.translation.findMany({
    where: {
      lang: targetLang,
      id: { in: [...new Set(pairs.map((row) => row.translationId))] },
    },
    select: { id: true, entryId: true },
  });
  const entryByTranslation = new Map(
    translations.map((row) => [row.id, row.entryId]),
  );
  return pairs
    .map((row) => ({
      translationId: row.translationId,
      tenseKey: row.tenseKey,
      entryId: entryByTranslation.get(row.translationId) ?? "",
    }))
    .filter((row) => row.entryId);
}

async function loadConjugationCandidates(
  prisma: Db,
  userId: string,
  targetLang: string,
  retryKeys: Set<string>,
  leechKeySet: Set<string>,
): Promise<DailyCandidate[]> {
  const [fresh, extra] = await Promise.all([
    loadNewConjugationCandidates(prisma, userId, targetLang),
    loadPriorityConjugationGroups(
      prisma,
      targetLang,
      new Set([...retryKeys, ...leechKeySet]),
    ),
  ]);
  const groups = new Map<
    string,
    { translationId: string; entryId: string; tenseKey: string }
  >();
  for (const group of [...fresh, ...extra]) {
    groups.set(`${group.translationId}:${group.tenseKey}`, group);
  }
  return [...groups.values()].map((group) => {
    const key = dailyItemKey(
      DailyItemType.CONJUGATION,
      group.translationId,
      group.tenseKey,
    );
    const isRetry = retryKeys.has(key);
    const isLeech = leechKeySet.has(key);
    return {
      itemType: DailyItemType.CONJUGATION,
      refId: group.translationId,
      refKey: group.tenseKey,
      domainId: null,
      grammarBonus: false,
      isRetry,
      isLeech,
      key,
      weight: candidateWeight({ grammarBonus: false, isRetry, isLeech }),
    };
  });
}

function pickFromPool(pool: DailyCandidate[], count: number): DailyCandidate[] {
  if (count <= 0) return [];
  const retries = pool.filter((item) => item.isRetry);
  const rest = pool.filter((item) => !item.isRetry);
  const pickedRetries = pickStratified(retries, Math.min(count, retries.length));
  const remaining = count - pickedRetries.length;
  const pickedRest = pickStratified(rest, remaining);
  return [...pickedRetries, ...pickedRest];
}

export async function buildDailySelection(
  prisma: Db,
  userId: string,
  targetLang: string,
  config: DailyPackageConfig,
  grammarTopicId: string | null,
): Promise<DailyCandidate[]> {
  const [retryKeys, leechKeySet] = await Promise.all([
    lastWrongKeys(prisma, userId, targetLang),
    leechKeys(prisma, userId, targetLang),
  ]);

  const [satzPool, entryPool, conjPool] = await Promise.all([
    loadNewSatzCandidates(
      prisma,
      userId,
      targetLang,
      grammarTopicId,
      retryKeys,
      leechKeySet,
    ),
    loadNewEntryCandidates(prisma, userId, targetLang, retryKeys, leechKeySet),
    loadConjugationCandidates(
      prisma,
      userId,
      targetLang,
      retryKeys,
      leechKeySet,
    ),
  ]);

  const satz = pickFromPool(satzPool, config.satzCount);
  const entries = pickFromPool(entryPool, config.vocabCount);
  const conj = pickFromPool(conjPool, config.conjCount);
  return interleaveByType([satz, entries, conj]);
}

export async function requestDailyAudio(
  items: DailyCandidate[],
  targetLang: string,
) {
  const satzIds = items
    .filter((item) => item.itemType === DailyItemType.SATZ)
    .map((item) => item.refId);
  const entryIds = items
    .filter((item) => item.itemType === DailyItemType.ENTRY)
    .map((item) => item.refId);
  const conjItems = items
    .filter((item) => item.itemType === DailyItemType.CONJUGATION && item.refKey)
    .map((item) => ({ translationId: item.refId, tenseKey: item.refKey! }));

  await Promise.all([
    satzIds.length > 0
      ? requestSatzAudio({
          satzIds,
          langs: [targetLang],
          includeQuestions: true,
        })
      : Promise.resolve(),
    entryIds.length > 0
      ? requestEntryAudio({ entryIds, langs: [targetLang] })
      : Promise.resolve(),
    conjItems.length > 0
      ? requestParadigmAudio({ items: conjItems })
      : Promise.resolve(),
  ]);
}

function firstTranslation<T extends { register?: string }>(
  rows: T[],
): T | undefined {
  return rows.find((row) => row.register === "INFORMAL") ?? rows[0];
}

export async function hydrateDailyItems(
  prisma: Db,
  items: DailyPackageItem[],
  targetLang: string,
): Promise<HydratedDailyItem[]> {
  const satzIds = items
    .filter((item) => item.itemType === DailyItemType.SATZ)
    .map((item) => item.refId);
  const entryIds = items
    .filter((item) => item.itemType === DailyItemType.ENTRY)
    .map((item) => item.refId);
  const conjTranslationIds = items
    .filter((item) => item.itemType === DailyItemType.CONJUGATION)
    .map((item) => item.refId);
  const domainIds = items
    .map((item) => item.domainIdSnapshot)
    .filter((id): id is string => Boolean(id));

  const [saetze, entries, translations, domains] = await Promise.all([
    satzIds.length
      ? prisma.satz.findMany({
          where: { id: { in: satzIds } },
          include: {
            translations: { where: { lang: targetLang } },
            domains: { include: { domain: true } },
            answerTo: {
              include: {
                translations: { where: { lang: targetLang } },
              },
            },
          },
        })
      : Promise.resolve([]),
    entryIds.length
      ? prisma.entry.findMany({
          where: { id: { in: entryIds } },
          include: {
            translations: { where: { lang: targetLang } },
            domains: { include: { domain: true } },
          },
        })
      : Promise.resolve([]),
    conjTranslationIds.length
      ? prisma.translation.findMany({
          where: { id: { in: conjTranslationIds } },
          include: {
            entry: true,
            conjugationForms: true,
            tenseAudios: true,
          },
        })
      : Promise.resolve([]),
    domainIds.length
      ? prisma.domain.findMany({
          where: { id: { in: domainIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const satzById = new Map(saetze.map((row) => [row.id, row]));
  const entryById = new Map(entries.map((row) => [row.id, row]));
  const translationById = new Map(translations.map((row) => [row.id, row]));
  const domainById = new Map(domains.map((row) => [row.id, row]));

  return items.map((item) => {
    const snapDomain = item.domainIdSnapshot
      ? (domainById.get(item.domainIdSnapshot) ?? null)
      : null;

    if (item.itemType === DailyItemType.SATZ) {
      const satz = satzById.get(item.refId);
      const translation = satz ? firstTranslation(satz.translations) : undefined;
      const domain =
        snapDomain ?? satz?.domains[0]?.domain ?? null;
      const answerClips = playbackClips({
        mainUrl: satz?.mainAudioUrl,
        mainStatus: satz?.mainAudioStatus,
        mainUpdatedAt: satz?.updatedAt,
        mainDurationMs: satz?.mainAudioDurationMs,
        translationUrl: translation?.audioUrl,
        translationStatus: translation?.audioStatus,
        translationUpdatedAt: translation?.updatedAt,
        translationDurationMs: translation?.audioDurationMs,
      });
      const question = satz?.answerTo
        ? firstTranslation(satz.answerTo.translations)
        : undefined;
      const questionClips = satz?.answerTo
        ? playbackClips({
            mainUrl: satz.answerTo.mainAudioUrl,
            mainStatus: satz.answerTo.mainAudioStatus,
            mainUpdatedAt: satz.answerTo.updatedAt,
            mainDurationMs: satz.answerTo.mainAudioDurationMs,
            translationUrl: question?.audioUrl,
            translationStatus: question?.audioStatus,
            translationUpdatedAt: question?.updatedAt,
            translationDurationMs: question?.audioDurationMs,
          })
        : [];
      return {
        id: item.id,
        itemType: item.itemType,
        refId: item.refId,
        refKey: item.refKey,
        position: item.position,
        testResult: item.testResult,
        grammarTopicBonusApplied: item.grammarTopicBonusApplied,
        domain,
        nativeText: satz?.mainText ?? "—",
        targetText: translation?.text ?? "—",
        tenseLabel: null,
        forms: [],
        audioStatus: translation?.audioStatus ?? AudioStatus.NONE,
        audioUrl: translation?.audioUrl ?? satz?.mainAudioUrl ?? null,
        audioDurationMs:
          translation?.audioDurationMs ?? satz?.mainAudioDurationMs ?? null,
        questionText: question?.text ?? satz?.answerTo?.mainText ?? null,
        questionTranslation: satz?.answerTo?.mainText ?? null,
        questionClips,
        answerClips,
        clips: [...questionClips, ...answerClips],
      };
    }

    if (item.itemType === DailyItemType.ENTRY) {
      const entry = entryById.get(item.refId);
      const translation = entry?.translations[0];
      const domain = snapDomain ?? entry?.domains[0]?.domain ?? null;
      const clips = playbackClips({
        mainUrl: entry?.mainAudioUrl,
        mainStatus: entry?.mainAudioStatus,
        mainUpdatedAt: entry?.updatedAt,
        mainDurationMs: entry?.mainAudioDurationMs,
        translationUrl: translation?.audioUrl,
        translationStatus: translation?.audioStatus,
        translationUpdatedAt: translation?.updatedAt,
        translationDurationMs: translation?.audioDurationMs,
      });
      return {
        id: item.id,
        itemType: item.itemType,
        refId: item.refId,
        refKey: item.refKey,
        position: item.position,
        testResult: item.testResult,
        grammarTopicBonusApplied: item.grammarTopicBonusApplied,
        domain,
        nativeText: entry?.mainText ?? "—",
        targetText: translation?.text ?? "—",
        tenseLabel: null,
        forms: [],
        audioStatus: translation?.audioStatus ?? AudioStatus.NONE,
        audioUrl: translation?.audioUrl ?? null,
        audioDurationMs: translation?.audioDurationMs ?? null,
        questionText: null,
        questionTranslation: null,
        questionClips: [],
        answerClips: clips,
        clips,
      };
    }

    const translation = translationById.get(item.refId);
    const tenseKey = item.refKey ?? "";
    const tenseAudio = translation?.tenseAudios.find(
      (row) => row.tenseKey === tenseKey,
    );
    const labels = personLabels(targetLang);
    const forms = (translation?.conjugationForms ?? [])
      .filter((form) => form.tenseKey === tenseKey)
      .sort((a, b) => a.personIndex - b.personIndex)
      .map((form) => ({
        personIndex: form.personIndex,
        personLabel: labels[form.personIndex] ?? `P${form.personIndex + 1}`,
        form: form.form,
      }));
    const clips =
      tenseAudio?.audioStatus === AudioStatus.DONE && tenseAudio.audioUrl
        ? [
            {
              url: tenseAudio.audioUrl.startsWith("/api/")
                ? tenseAudio.audioUrl
                : conjAudioPublicPath(tenseAudio.id),
              durationMs: tenseAudio.audioDurationMs ?? null,
              kind: "translation" as const,
            },
          ]
        : tenseAudio?.audioStatus === AudioStatus.DONE
          ? [
              {
                url: conjAudioPublicPath(tenseAudio.id),
                durationMs: tenseAudio.audioDurationMs ?? null,
                kind: "translation" as const,
              },
            ]
          : [];

    return {
      id: item.id,
      itemType: item.itemType,
      refId: item.refId,
      refKey: item.refKey,
      position: item.position,
      testResult: item.testResult,
      grammarTopicBonusApplied: item.grammarTopicBonusApplied,
      domain: snapDomain,
      nativeText: translation?.entry.mainText ?? "—",
      targetText: translation?.text ?? "—",
      tenseLabel: tenseKey ? tenseLabel(targetLang, tenseKey) : null,
      forms,
      audioStatus: tenseAudio?.audioStatus ?? AudioStatus.NONE,
      audioUrl: clips[0]?.url ?? null,
      audioDurationMs: tenseAudio?.audioDurationMs ?? null,
      questionText: null,
      questionTranslation: null,
      questionClips: [],
      answerClips: clips,
      clips,
    };
  });
}

export function itemsAudioReady(items: HydratedDailyItem[]): boolean {
  return items.length > 0 && items.every((item) => item.answerClips.length > 0);
}

export async function toHydratedPackage(
  prisma: Db,
  pkg: DailyPackage & { items: DailyPackageItem[] },
) {
  const items = await hydrateDailyItems(
    prisma,
    [...pkg.items].sort((a, b) => a.position - b.position),
    pkg.targetLang,
  );
  const audioReady = itemsAudioReady(items);
  const audioDone = items.filter((item) => item.answerClips.length > 0).length;
  return {
    id: pkg.id,
    targetLang: pkg.targetLang,
    date: pkg.date,
    status: pkg.status,
    targetSatzCount: pkg.targetSatzCount,
    targetVocabCount: pkg.targetVocabCount,
    targetConjCount: pkg.targetConjCount,
    createdAt: pkg.createdAt,
    activatedAt: pkg.activatedAt,
    completedAt: pkg.completedAt,
    audioReady,
    audioDone,
    audioTotal: items.length,
    correctCount: items.filter((item) => item.testResult === "CORRECT").length,
    answeredCount: items.filter((item) => item.testResult !== "PENDING").length,
    items,
  };
}

export async function findOpenPackage(
  prisma: Db,
  userId: string,
  targetLang: string,
  date: string,
) {
  return prisma.dailyPackage.findFirst({
    where: {
      userId,
      targetLang,
      date,
      status: { not: DailyPackageStatus.ABANDONED },
    },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });
}

export type DailyPackageSummary = {
  id: string;
  date: string;
  status: DailyPackageStatus;
  itemCount: number;
  satzCount: number;
  vocabCount: number;
  conjCount: number;
  correctCount: number;
  answeredCount: number;
};

export async function listPackages(
  prisma: Db,
  userId: string,
  targetLang: string,
  limit = 30,
): Promise<DailyPackageSummary[]> {
  const packages = await prisma.dailyPackage.findMany({
    where: {
      userId,
      targetLang,
      status: { not: DailyPackageStatus.ABANDONED },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      items: {
        select: { itemType: true, testResult: true },
      },
    },
  });

  return packages.map((pkg) => ({
    id: pkg.id,
    date: pkg.date,
    status: pkg.status,
    itemCount: pkg.items.length,
    satzCount: pkg.items.filter((item) => item.itemType === DailyItemType.SATZ)
      .length,
    vocabCount: pkg.items.filter((item) => item.itemType === DailyItemType.ENTRY)
      .length,
    conjCount: pkg.items.filter(
      (item) => item.itemType === DailyItemType.CONJUGATION,
    ).length,
    correctCount: pkg.items.filter(
      (item) => item.testResult === DailyTestResult.CORRECT,
    ).length,
    answeredCount: pkg.items.filter(
      (item) => item.testResult !== DailyTestResult.PENDING,
    ).length,
  }));
}

export async function completeDailyToLeitner(
  prisma: Db,
  userId: string,
  pkg: DailyPackage & { items: DailyPackageItem[] },
) {
  const now = new Date();
  const nextReviewAt = scheduleNextReview(MIN_BOX, now);

  for (const item of pkg.items) {
    const isCorrect = item.testResult === DailyTestResult.CORRECT;
    if (item.itemType === DailyItemType.SATZ) {
      const existing = await prisma.satzProgress.findUnique({
        where: {
          userId_satzId_targetLang: {
            userId,
            satzId: item.refId,
            targetLang: pkg.targetLang,
          },
        },
      });
      const progress = existing
        ? await prisma.satzProgress.update({
            where: { id: existing.id },
            data: {
              box: MIN_BOX,
              nextReviewAt,
              correctCount: existing.correctCount + (isCorrect ? 1 : 0),
              wrongCount: existing.wrongCount + (isCorrect ? 0 : 1),
              lastReviewedAt: now,
            },
          })
        : await prisma.satzProgress.create({
            data: {
              userId,
              satzId: item.refId,
              targetLang: pkg.targetLang,
              box: MIN_BOX,
              nextReviewAt,
              correctCount: isCorrect ? 1 : 0,
              wrongCount: isCorrect ? 0 : 1,
              lastReviewedAt: now,
            },
          });
      await prisma.satzReviewLog.create({
        data: { satzProgressId: progress.id, isCorrect },
      });
      continue;
    }

    if (item.itemType === DailyItemType.ENTRY) {
      const existing = await prisma.userProgress.findUnique({
        where: {
          userId_entryId_targetLang_cardKey: {
            userId,
            entryId: item.refId,
            targetLang: pkg.targetLang,
            cardKey: VOCAB_CARD_KEY,
          },
        },
      });
      const progress = existing
        ? await prisma.userProgress.update({
            where: { id: existing.id },
            data: {
              box: MIN_BOX,
              nextReviewAt,
              correctCount: existing.correctCount + (isCorrect ? 1 : 0),
              wrongCount: existing.wrongCount + (isCorrect ? 0 : 1),
              lastReviewedAt: now,
            },
          })
        : await prisma.userProgress.create({
            data: {
              userId,
              entryId: item.refId,
              targetLang: pkg.targetLang,
              cardType: CardType.VOCAB,
              cardKey: VOCAB_CARD_KEY,
              box: MIN_BOX,
              nextReviewAt,
              correctCount: isCorrect ? 1 : 0,
              wrongCount: isCorrect ? 0 : 1,
              lastReviewedAt: now,
            },
          });
      await prisma.reviewLog.create({
        data: {
          userProgressId: progress.id,
          targetLang: pkg.targetLang,
          userAnswer: "",
          expected: "",
          isCorrect,
        },
      });
      continue;
    }

    const translation = await prisma.translation.findUnique({
      where: { id: item.refId },
      select: { entryId: true },
    });
    if (!translation || !item.refKey) continue;
    const cardKey = conjugationCardKey(item.refKey);
    const existing = await prisma.userProgress.findUnique({
      where: {
        userId_entryId_targetLang_cardKey: {
          userId,
          entryId: translation.entryId,
          targetLang: pkg.targetLang,
          cardKey,
        },
      },
    });
    const progress = existing
      ? await prisma.userProgress.update({
          where: { id: existing.id },
          data: {
            box: MIN_BOX,
            nextReviewAt,
            correctCount: existing.correctCount + (isCorrect ? 1 : 0),
            wrongCount: existing.wrongCount + (isCorrect ? 0 : 1),
            lastReviewedAt: now,
          },
        })
      : await prisma.userProgress.create({
          data: {
            userId,
            entryId: translation.entryId,
            targetLang: pkg.targetLang,
            cardType: CardType.CONJUGATION,
            cardKey,
            box: MIN_BOX,
            nextReviewAt,
            correctCount: isCorrect ? 1 : 0,
            wrongCount: isCorrect ? 0 : 1,
            lastReviewedAt: now,
          },
        });
    await prisma.reviewLog.create({
      data: {
        userProgressId: progress.id,
        targetLang: pkg.targetLang,
        userAnswer: "",
        expected: item.refKey,
        isCorrect,
      },
    });
  }
}

export async function computeBurndown(
  prisma: Db,
  userId: string,
  targetLang: string,
) {
  const open = await countNewPools(prisma, userId, targetLang);
  const recent = await prisma.dailyPackage.findMany({
    where: { userId, targetLang, status: DailyPackageStatus.PRODUCTIVE },
    orderBy: { completedAt: "desc" },
    take: 7,
    include: { items: { select: { itemType: true } } },
  });

  const totals = { satz: 0, vocab: 0, conj: 0 };
  for (const pkg of recent) {
    for (const item of pkg.items) {
      if (item.itemType === DailyItemType.SATZ) totals.satz += 1;
      else if (item.itemType === DailyItemType.ENTRY) totals.vocab += 1;
      else totals.conj += 1;
    }
  }
  const days = Math.max(recent.length, 1);
  const avg = {
    satz: recent.length ? totals.satz / days : 0,
    vocab: recent.length ? totals.vocab / days : 0,
    conj: recent.length ? totals.conj / days : 0,
  };
  const estimatedDays = (openCount: number, dailyAvg: number) =>
    dailyAvg > 0 ? Math.ceil(openCount / dailyAvg) : null;

  return {
    open,
    averagePerDay: avg,
    sampleDays: recent.length,
    estimatedDays: {
      satz: estimatedDays(open.satz, avg.satz),
      vocab: estimatedDays(open.vocab, avg.vocab),
      conj: estimatedDays(open.conj, avg.conj),
      total: estimatedDays(
        open.satz + open.vocab + open.conj,
        avg.satz + avg.vocab + avg.conj,
      ),
    },
  };
}


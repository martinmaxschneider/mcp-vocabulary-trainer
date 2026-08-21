import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AudioStatus, Prisma } from "@prisma/client";
import { audioDurationMs } from "~/lib/audio-duration";
import { TARGET_LANG_CODES } from "~/lib/languages";
import { paradigmSpeakText } from "~/lib/conjugation-catalog";
import {
  audioFileName,
  audioPublicPath,
  conjAudioFileName,
  conjAudioPublicPath,
  entryMainAudioFileName,
  entryMainAudioPublicPath,
  mainAudioFileName,
  mainAudioPublicPath,
  voiceForSatz,
} from "~/lib/satz-tts";
import { db } from "~/server/db";
import { getTtsSettings } from "~/server/services/ai-settings";
import { createSpeechMp3 } from "~/server/services/openrouter";

type DbClient = typeof db | Prisma.TransactionClient;

export function audioDir(): string {
  return path.resolve(process.cwd(), "data", "audio");
}

export function audioFilePath(translationId: string): string {
  return path.join(audioDir(), audioFileName(translationId));
}

export function mainAudioFilePath(satzId: string): string {
  return path.join(audioDir(), mainAudioFileName(satzId));
}

export function entryMainAudioFilePath(entryId: string): string {
  return path.join(audioDir(), entryMainAudioFileName(entryId));
}

export function conjAudioFilePath(audioId: string): string {
  return path.join(audioDir(), conjAudioFileName(audioId));
}

async function ensureAudioDir() {
  await mkdir(audioDir(), { recursive: true });
}

export async function deleteAudioFile(translationId: string): Promise<void> {
  try {
    await unlink(audioFilePath(translationId));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
}

export async function deleteAudioFiles(translationIds: string[]): Promise<void> {
  await Promise.all(translationIds.map((id) => deleteAudioFile(id)));
}

export async function deleteMainAudioFile(satzId: string): Promise<void> {
  try {
    await unlink(mainAudioFilePath(satzId));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
}

export async function deleteMainAudioFiles(satzIds: string[]): Promise<void> {
  await Promise.all(satzIds.map((id) => deleteMainAudioFile(id)));
}

export async function deleteEntryMainAudioFile(entryId: string): Promise<void> {
  try {
    await unlink(entryMainAudioFilePath(entryId));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
}

export async function deleteConjAudioFile(audioId: string): Promise<void> {
  try {
    await unlink(conjAudioFilePath(audioId));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
}

export async function wipeAllSatzAudio(): Promise<void> {
  await rm(audioDir(), { recursive: true, force: true });
}

async function synthesizeMp3(
  text: string,
  voice: string,
  model?: string,
  language?: string,
) {
  return createSpeechMp3({ text, voice, model, language });
}

export async function requestSatzAudio(params: {
  satzIds: string[];
  includeQuestions?: boolean;
  langs?: string[];
  includeMain?: boolean;
  regenerate?: boolean;
}): Promise<{ requested: number; satzIds: string[] }> {
  const langs = params.langs === undefined ? [...TARGET_LANG_CODES] : params.langs;
  const includeMain = params.includeMain ?? true;
  const satzIds = [...new Set(params.satzIds)];
  if (satzIds.length === 0) {
    return { requested: 0, satzIds: [] };
  }

  const saetze = await db.satz.findMany({
    where: { id: { in: satzIds } },
    select: { id: true, answerToId: true },
  });
  const ids = new Set(saetze.map((s) => s.id));
  if (params.includeQuestions) {
    for (const satz of saetze) {
      if (satz.answerToId) ids.add(satz.answerToId);
    }
  }

  const idList = [...ids];
  const [translations, mainRows] = await Promise.all([
    langs.length === 0
      ? Promise.resolve([] as Array<{ id: string; audioStatus: AudioStatus }>)
      : db.satzTranslation.findMany({
          where: {
            satzId: { in: idList },
            lang: { in: langs },
          },
          select: { id: true, audioStatus: true },
        }),
    includeMain
      ? db.satz.findMany({
          where: { id: { in: idList } },
          select: { id: true, mainAudioStatus: true },
        })
      : Promise.resolve([] as Array<{ id: string; mainAudioStatus: AudioStatus }>),
  ]);

  const toRequest = translations.filter((t) => {
    if (params.regenerate) return true;
    return t.audioStatus !== AudioStatus.DONE;
  });
  const mainToRequest = mainRows.filter((row) => {
    if (params.regenerate) return true;
    return row.mainAudioStatus !== AudioStatus.DONE;
  });

  if (params.regenerate) {
    await deleteAudioFiles(toRequest.map((t) => t.id));
    await deleteMainAudioFiles(mainToRequest.map((row) => row.id));
  }

  if (toRequest.length > 0) {
    await db.satzTranslation.updateMany({
      where: { id: { in: toRequest.map((t) => t.id) } },
      data: {
        audioStatus: AudioStatus.REQUESTED,
        ...(params.regenerate
          ? { audioUrl: null, audioDurationMs: null }
          : {}),
      },
    });
  }

  if (mainToRequest.length > 0) {
    await db.satz.updateMany({
      where: { id: { in: mainToRequest.map((row) => row.id) } },
      data: {
        mainAudioStatus: AudioStatus.REQUESTED,
        ...(params.regenerate
          ? { mainAudioUrl: null, mainAudioDurationMs: null }
          : {}),
      },
    });
  }

  return {
    requested: toRequest.length + mainToRequest.length,
    satzIds: idList,
  };
}

export async function processRequestedAudio(limit: number): Promise<{
  processed: number;
  failed: number;
  remaining: number;
}> {
  const pendingMain = await db.satz.findMany({
    where: { mainAudioStatus: AudioStatus.REQUESTED },
    take: limit,
    orderBy: { updatedAt: "asc" },
    select: { id: true, mainText: true, mainLang: true },
  });

  let processed = 0;
  let failed = 0;
  await ensureAudioDir();

  for (const satz of pendingMain) {
    try {
      const tts = await getTtsSettings(satz.mainLang);
      const voice = voiceForSatz(satz.mainText, {
        question: tts.voiceQuestion,
        answer: tts.voiceAnswer,
      });
      const audio = await synthesizeMp3(
        satz.mainText,
        voice,
        tts.model,
        satz.mainLang,
      );
      await writeFile(mainAudioFilePath(satz.id), audio.buffer);
      await db.satz.update({
        where: { id: satz.id },
        data: {
          mainAudioStatus: AudioStatus.DONE,
          mainAudioUrl: mainAudioPublicPath(satz.id),
          mainAudioDurationMs: audioDurationMs(audio.buffer),
        },
      });
      processed += 1;
    } catch (error) {
      console.error("Satz main TTS failed:", error);
      await db.satz.update({
        where: { id: satz.id },
        data: {
          mainAudioStatus: AudioStatus.NONE,
          mainAudioUrl: null,
          mainAudioDurationMs: null,
        },
      });
      failed += 1;
    }
  }

  const translationLimit = Math.max(0, limit - pendingMain.length);
  const pending =
    translationLimit > 0
      ? await db.satzTranslation.findMany({
          where: { audioStatus: AudioStatus.REQUESTED },
          take: translationLimit,
          orderBy: { updatedAt: "asc" },
          include: {
            satz: { select: { id: true, mainText: true } },
          },
        })
      : [];

  for (const translation of pending) {
    try {
      const tts = await getTtsSettings(translation.lang);
      const voice = voiceForSatz(translation.satz.mainText, {
        question: tts.voiceQuestion,
        answer: tts.voiceAnswer,
      });
      const audio = await synthesizeMp3(
        translation.text,
        voice,
        tts.model,
        translation.lang,
      );
      await writeFile(audioFilePath(translation.id), audio.buffer);
      await db.satzTranslation.update({
        where: { id: translation.id },
        data: {
          audioStatus: AudioStatus.DONE,
          audioUrl: audioPublicPath(translation.id),
          audioDurationMs: audioDurationMs(audio.buffer),
        },
      });
      processed += 1;
    } catch (error) {
      console.error("Satz TTS failed:", error);
      await db.satzTranslation.update({
        where: { id: translation.id },
        data: {
          audioStatus: AudioStatus.NONE,
          audioUrl: null,
          audioDurationMs: null,
        },
      });
      failed += 1;
    }
  }

  const leftover = Math.max(0, limit - processed - failed);
  if (leftover > 0) {
    const extra = await processRequestedEntryAndConjAudio(leftover);
    processed += extra.processed;
    failed += extra.failed;
  }

  const remaining = await countRequestedAudio();
  return { processed, failed, remaining };
}

async function countRequestedAudio() {
  const [satzTr, satzMain, entryTr, entryMain, conj] = await Promise.all([
    db.satzTranslation.count({ where: { audioStatus: AudioStatus.REQUESTED } }),
    db.satz.count({ where: { mainAudioStatus: AudioStatus.REQUESTED } }),
    db.translation.count({ where: { audioStatus: AudioStatus.REQUESTED } }),
    db.entry.count({ where: { mainAudioStatus: AudioStatus.REQUESTED } }),
    db.conjugationTenseAudio.count({
      where: { audioStatus: AudioStatus.REQUESTED },
    }),
  ]);
  return satzTr + satzMain + entryTr + entryMain + conj;
}

export async function requestEntryAudio(params: {
  entryIds: string[];
  langs?: string[];
  regenerate?: boolean;
}): Promise<{ requested: number; entryIds: string[] }> {
  const langs = params.langs?.length ? params.langs : [...TARGET_LANG_CODES];
  const entryIds = [...new Set(params.entryIds)];
  if (entryIds.length === 0) return { requested: 0, entryIds: [] };

  const [translations, mains] = await Promise.all([
    db.translation.findMany({
      where: { entryId: { in: entryIds }, lang: { in: langs } },
      select: { id: true, audioStatus: true },
    }),
    db.entry.findMany({
      where: { id: { in: entryIds } },
      select: { id: true, mainAudioStatus: true },
    }),
  ]);

  const toRequest = translations.filter((row) =>
    params.regenerate ? true : row.audioStatus !== AudioStatus.DONE,
  );
  const mainToRequest = mains.filter((row) =>
    params.regenerate ? true : row.mainAudioStatus !== AudioStatus.DONE,
  );

  if (params.regenerate) {
    await deleteAudioFiles(toRequest.map((row) => row.id));
    await Promise.all(mainToRequest.map((row) => deleteEntryMainAudioFile(row.id)));
  }

  if (toRequest.length > 0) {
    await db.translation.updateMany({
      where: { id: { in: toRequest.map((row) => row.id) } },
      data: {
        audioStatus: AudioStatus.REQUESTED,
        ...(params.regenerate ? { audioUrl: null, audioDurationMs: null } : {}),
      },
    });
  }

  if (mainToRequest.length > 0) {
    await db.entry.updateMany({
      where: { id: { in: mainToRequest.map((row) => row.id) } },
      data: {
        mainAudioStatus: AudioStatus.REQUESTED,
        ...(params.regenerate
          ? { mainAudioUrl: null, mainAudioDurationMs: null }
          : {}),
      },
    });
  }

  return {
    requested: toRequest.length + mainToRequest.length,
    entryIds,
  };
}

export async function requestParadigmAudio(params: {
  items: Array<{ translationId: string; tenseKey: string }>;
  regenerate?: boolean;
}): Promise<{ requested: number }> {
  const unique = new Map<string, { translationId: string; tenseKey: string }>();
  for (const item of params.items) {
    unique.set(`${item.translationId}:${item.tenseKey}`, item);
  }
  const items = [...unique.values()];
  if (items.length === 0) return { requested: 0 };

  const existing = await db.conjugationTenseAudio.findMany({
    where: {
      OR: items.map((item) => ({
        translationId: item.translationId,
        tenseKey: item.tenseKey,
      })),
    },
  });
  const existingKey = new Set(
    existing.map((row) => `${row.translationId}:${row.tenseKey}`),
  );

  const toCreate = items.filter(
    (item) => !existingKey.has(`${item.translationId}:${item.tenseKey}`),
  );
  if (toCreate.length > 0) {
    await db.conjugationTenseAudio.createMany({
      data: toCreate.map((item) => ({
        translationId: item.translationId,
        tenseKey: item.tenseKey,
        audioStatus: AudioStatus.REQUESTED,
      })),
    });
  }

  const toUpdate = existing.filter((row) =>
    params.regenerate ? true : row.audioStatus !== AudioStatus.DONE,
  );
  if (params.regenerate) {
    await Promise.all(toUpdate.map((row) => deleteConjAudioFile(row.id)));
  }
  if (toUpdate.length > 0) {
    await db.conjugationTenseAudio.updateMany({
      where: { id: { in: toUpdate.map((row) => row.id) } },
      data: {
        audioStatus: AudioStatus.REQUESTED,
        ...(params.regenerate ? { audioUrl: null, audioDurationMs: null } : {}),
      },
    });
  }

  return { requested: toCreate.length + toUpdate.length };
}

async function processRequestedEntryAndConjAudio(limit: number): Promise<{
  processed: number;
  failed: number;
}> {
  let processed = 0;
  let failed = 0;
  await ensureAudioDir();

  const pendingMain = await db.entry.findMany({
    where: { mainAudioStatus: AudioStatus.REQUESTED },
    take: limit,
    orderBy: { updatedAt: "asc" },
    select: { id: true, mainText: true, mainLang: true },
  });

  for (const entry of pendingMain) {
    try {
      const tts = await getTtsSettings(entry.mainLang);
      const audio = await synthesizeMp3(
        entry.mainText,
        tts.voiceAnswer,
        tts.model,
        entry.mainLang,
      );
      await writeFile(entryMainAudioFilePath(entry.id), audio.buffer);
      await db.entry.update({
        where: { id: entry.id },
        data: {
          mainAudioStatus: AudioStatus.DONE,
          mainAudioUrl: entryMainAudioPublicPath(entry.id),
          mainAudioDurationMs: audioDurationMs(audio.buffer),
        },
      });
      processed += 1;
    } catch (error) {
      console.error("Entry main TTS failed:", error);
      await db.entry.update({
        where: { id: entry.id },
        data: {
          mainAudioStatus: AudioStatus.NONE,
          mainAudioUrl: null,
          mainAudioDurationMs: null,
        },
      });
      failed += 1;
    }
  }

  const translationLimit = Math.max(0, limit - processed - failed);
  const pendingTranslations =
    translationLimit > 0
      ? await db.translation.findMany({
          where: { audioStatus: AudioStatus.REQUESTED },
          take: translationLimit,
          orderBy: { updatedAt: "asc" },
          select: { id: true, text: true, lang: true },
        })
      : [];

  for (const translation of pendingTranslations) {
    try {
      const tts = await getTtsSettings(translation.lang);
      const audio = await synthesizeMp3(
        translation.text,
        tts.voiceAnswer,
        tts.model,
        translation.lang,
      );
      await writeFile(audioFilePath(translation.id), audio.buffer);
      await db.translation.update({
        where: { id: translation.id },
        data: {
          audioStatus: AudioStatus.DONE,
          audioUrl: audioPublicPath(translation.id),
          audioDurationMs: audioDurationMs(audio.buffer),
        },
      });
      processed += 1;
    } catch (error) {
      console.error("Entry translation TTS failed:", error);
      await db.translation.update({
        where: { id: translation.id },
        data: {
          audioStatus: AudioStatus.NONE,
          audioUrl: null,
          audioDurationMs: null,
        },
      });
      failed += 1;
    }
  }

  const conjLimit = Math.max(0, limit - processed - failed);
  const pendingConj =
    conjLimit > 0
      ? await db.conjugationTenseAudio.findMany({
          where: { audioStatus: AudioStatus.REQUESTED },
          take: conjLimit,
          orderBy: { updatedAt: "asc" },
          include: {
            translation: {
              select: {
                lang: true,
                conjugationForms: {
                  select: { tenseKey: true, personIndex: true, form: true },
                },
              },
            },
          },
        })
      : [];

  for (const row of pendingConj) {
    try {
      const forms = row.translation.conjugationForms.filter(
        (form) => form.tenseKey === row.tenseKey,
      );
      const text = paradigmSpeakText(row.translation.lang, forms);
      if (!text) throw new Error("Empty paradigm text");
      const tts = await getTtsSettings(row.translation.lang);
      const audio = await synthesizeMp3(
        text,
        tts.voiceAnswer,
        tts.model,
        row.translation.lang,
      );
      await writeFile(conjAudioFilePath(row.id), audio.buffer);
      await db.conjugationTenseAudio.update({
        where: { id: row.id },
        data: {
          audioStatus: AudioStatus.DONE,
          audioUrl: conjAudioPublicPath(row.id),
          audioDurationMs: audioDurationMs(audio.buffer),
        },
      });
      processed += 1;
    } catch (error) {
      console.error("Paradigm TTS failed:", error);
      await db.conjugationTenseAudio.update({
        where: { id: row.id },
        data: {
          audioStatus: AudioStatus.NONE,
          audioUrl: null,
          audioDurationMs: null,
        },
      });
      failed += 1;
    }
  }

  return { processed, failed };
}

export async function requestMissingParadigmAudio(params: {
  targetLang: string;
  tenseKeys?: string[];
  domainIds?: string[];
  regenerate?: boolean;
}): Promise<{ requested: number }> {
  const translations = await db.translation.findMany({
    where: {
      lang: params.targetLang,
      entry: {
        category: "VERB",
        ...(params.domainIds?.length
          ? { domains: { some: { domainId: { in: params.domainIds } } } }
          : {}),
      },
      conjugationForms: { some: {} },
    },
    select: {
      id: true,
      conjugationForms: { select: { tenseKey: true } },
    },
  });
  const items = translations.flatMap((translation) => {
    const tenses = [
      ...new Set(
        translation.conjugationForms
          .map((form) => form.tenseKey)
          .filter((key) =>
            params.tenseKeys?.length ? params.tenseKeys.includes(key) : true,
          ),
      ),
    ];
    return tenses.map((tenseKey) => ({
      translationId: translation.id,
      tenseKey,
    }));
  });
  return requestParadigmAudio({ items, regenerate: params.regenerate });
}

export async function getEntryAudioStatus(entryIds?: string[]) {
  const where = entryIds?.length
    ? { entryId: { in: entryIds }, lang: { in: [...TARGET_LANG_CODES] } }
    : { lang: { in: [...TARGET_LANG_CODES] } };

  const [none, requested, done] = await Promise.all([
    db.translation.count({
      where: { ...where, audioStatus: AudioStatus.NONE },
    }),
    db.translation.count({
      where: { ...where, audioStatus: AudioStatus.REQUESTED },
    }),
    db.translation.count({
      where: { ...where, audioStatus: AudioStatus.DONE },
    }),
  ]);

  return { none, requested, done, total: none + requested + done };
}

export async function getSatzAudioStatus(satzIds?: string[]) {
  const where = satzIds?.length
    ? { satzId: { in: satzIds }, lang: { in: [...TARGET_LANG_CODES] } }
    : { lang: { in: [...TARGET_LANG_CODES] } };

  const [none, requested, done] = await Promise.all([
    db.satzTranslation.count({
      where: { ...where, audioStatus: AudioStatus.NONE },
    }),
    db.satzTranslation.count({
      where: { ...where, audioStatus: AudioStatus.REQUESTED },
    }),
    db.satzTranslation.count({
      where: { ...where, audioStatus: AudioStatus.DONE },
    }),
  ]);

  return { none, requested, done, total: none + requested + done };
}

export async function deleteSatzAudioFiles(
  satzId: string,
  client: DbClient = db,
): Promise<void> {
  const translations = await client.satzTranslation.findMany({
    where: { satzId },
    select: { id: true },
  });
  await deleteAudioFiles(translations.map((t) => t.id));
  await deleteMainAudioFile(satzId);
}

async function durationFromFile(filePath: string): Promise<number | null> {
  try {
    const buffer = await readFile(filePath);
    return audioDurationMs(buffer);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

export async function backfillAudioDurations(limit = 200): Promise<{
  processed: number;
  skipped: number;
  remaining: number;
}> {
  const [mains, translations] = await Promise.all([
    db.satz.findMany({
      where: {
        mainAudioStatus: AudioStatus.DONE,
        mainAudioDurationMs: null,
      },
      select: { id: true },
      take: limit,
      orderBy: { updatedAt: "asc" },
    }),
    db.satzTranslation.findMany({
      where: {
        audioStatus: AudioStatus.DONE,
        audioDurationMs: null,
      },
      select: { id: true },
      take: limit,
      orderBy: { updatedAt: "asc" },
    }),
  ]);

  let processed = 0;
  let skipped = 0;

  for (const satz of mains) {
    const durationMs = await durationFromFile(mainAudioFilePath(satz.id));
    if (durationMs == null) {
      skipped += 1;
      continue;
    }
    await db.satz.update({
      where: { id: satz.id },
      data: { mainAudioDurationMs: durationMs },
    });
    processed += 1;
  }

  for (const translation of translations) {
    const durationMs = await durationFromFile(audioFilePath(translation.id));
    if (durationMs == null) {
      skipped += 1;
      continue;
    }
    await db.satzTranslation.update({
      where: { id: translation.id },
      data: { audioDurationMs: durationMs },
    });
    processed += 1;
  }

  const [remainingMain, remainingTranslations] = await Promise.all([
    db.satz.count({
      where: { mainAudioStatus: AudioStatus.DONE, mainAudioDurationMs: null },
    }),
    db.satzTranslation.count({
      where: { audioStatus: AudioStatus.DONE, audioDurationMs: null },
    }),
  ]);

  return {
    processed,
    skipped,
    remaining: remainingMain + remainingTranslations,
  };
}

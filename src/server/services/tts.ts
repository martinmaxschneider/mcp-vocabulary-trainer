import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AudioStatus, Prisma } from "@prisma/client";
import { audioDurationMs } from "~/lib/audio-duration";
import { TARGET_LANG_CODES } from "~/lib/languages";
import {
  audioFileName,
  audioPublicPath,
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
  regenerate?: boolean;
}): Promise<{ requested: number; satzIds: string[] }> {
  const langs = params.langs?.length ? params.langs : [...TARGET_LANG_CODES];
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
    db.satzTranslation.findMany({
      where: {
        satzId: { in: idList },
        lang: { in: langs },
      },
      select: { id: true, audioStatus: true },
    }),
    db.satz.findMany({
      where: { id: { in: idList } },
      select: { id: true, mainAudioStatus: true },
    }),
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

  const [remainingTranslations, remainingMain] = await Promise.all([
    db.satzTranslation.count({
      where: { audioStatus: AudioStatus.REQUESTED },
    }),
    db.satz.count({
      where: { mainAudioStatus: AudioStatus.REQUESTED },
    }),
  ]);

  return { processed, failed, remaining: remainingTranslations + remainingMain };
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

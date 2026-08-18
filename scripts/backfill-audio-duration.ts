import { readFile } from "node:fs/promises";
import path from "node:path";
import { AudioStatus, PrismaClient } from "@prisma/client";
import { audioDurationMs } from "../src/lib/audio-duration";

const db = new PrismaClient();
const audioDir = path.resolve(process.cwd(), "data", "audio");

async function durationFromFile(filePath: string): Promise<number | null> {
  try {
    return audioDurationMs(await readFile(filePath));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

async function main() {
  const [mains, translations] = await Promise.all([
    db.satz.findMany({
      where: { mainAudioStatus: AudioStatus.DONE, mainAudioDurationMs: null },
      select: { id: true },
    }),
    db.satzTranslation.findMany({
      where: { audioStatus: AudioStatus.DONE, audioDurationMs: null },
      select: { id: true },
    }),
  ]);

  let processed = 0;
  let skipped = 0;

  for (const satz of mains) {
    const durationMs = await durationFromFile(
      path.join(audioDir, `main-${satz.id}.mp3`),
    );
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
    const durationMs = await durationFromFile(
      path.join(audioDir, `${translation.id}.mp3`),
    );
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

  console.log(
    `[audio-duration] processed=${processed} skipped=${skipped} pending=${mains.length + translations.length - processed - skipped}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });

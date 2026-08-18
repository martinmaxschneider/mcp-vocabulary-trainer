#!/usr/bin/env node
/**
 * Fill Satz.mainAudioDurationMs and SatzTranslation.audioDurationMs
 * from existing MP3/WAV files in data/audio/.
 *
 * Usage: node scripts/backfill-audio-duration.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tsx = join(root, "node_modules", ".bin", "tsx");

const result = spawnSync(
  tsx,
  [join(root, "scripts", "backfill-audio-duration.ts")],
  { cwd: root, stdio: "inherit", env: process.env },
);

process.exit(result.status ?? 1);

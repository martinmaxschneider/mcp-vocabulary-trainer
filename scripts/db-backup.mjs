#!/usr/bin/env node
/**
 * Copy the SQLite database to data/backups/ before migrations.
 * Skips (exit 0) when the DB file does not exist yet (fresh install).
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prismaDir = join(root, "prisma");

function resolveDbPath() {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    return join(root, "data", "sprachen.db");
  }

  const withoutScheme = raw.startsWith("file:") ? raw.slice("file:".length) : raw;
  if (isAbsolute(withoutScheme)) {
    return withoutScheme;
  }
  // Prisma resolves relative file: URLs against the prisma/ directory
  return resolve(prismaDir, withoutScheme);
}

const dbPath = resolveDbPath();

if (!existsSync(dbPath)) {
  console.log(`[db:backup] No database at ${dbPath} — skip (fresh install).`);
  process.exit(0);
}

const backupsDir = join(root, "data", "backups");
mkdirSync(backupsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
const dest = join(backupsDir, `sprachen-${stamp}.db`);

copyFileSync(dbPath, dest);
console.log(`[db:backup] Saved ${dbPath} → ${dest}`);

#!/usr/bin/env node
/**
 * Safe migrate entrypoint:
 * 1. Backup existing SQLite DB (via db-backup.mjs)
 * 2. For DBs created with `db push` (no migration history): mark the
 *    baseline migration as already applied so existing data is not touched
 * 3. Run `prisma migrate deploy` (or `migrate dev` with --dev)
 *
 * Usage:
 *   node scripts/db-migrate.mjs
 *   node scripts/db-migrate.mjs --dev --name add_foo
 */
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prismaDir = join(root, "prisma");
const BASELINE = "20250807000000_baseline";

function resolveDbPath() {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    return join(root, "data", "sprachen.db");
  }
  const withoutScheme = raw.startsWith("file:") ? raw.slice("file:".length) : raw;
  if (isAbsolute(withoutScheme)) return withoutScheme;
  return resolve(prismaDir, withoutScheme);
}

const prismaBin = join(root, "node_modules", ".bin", "prisma");

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runPrisma(args) {
  run(prismaBin, args);
}

function sqliteQuery(dbPath, sql) {
  const result = spawnSync("sqlite3", [dbPath, sql], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return null;
  }
  return (result.stdout ?? "").trim();
}

function ensureBaselineResolved(dbPath) {
  if (!existsSync(dbPath)) return;

  const hasEntry = sqliteQuery(
    dbPath,
    `SELECT 1 FROM sqlite_master WHERE type='table' AND name='Entry' LIMIT 1`,
  );
  const hasDomain = sqliteQuery(
    dbPath,
    `SELECT 1 FROM sqlite_master WHERE type='table' AND name='Domain' LIMIT 1`,
  );
  if (!hasEntry && !hasDomain) return;

  const hasMigrationsTable = sqliteQuery(
    dbPath,
    `SELECT 1 FROM sqlite_master WHERE type='table' AND name='_prisma_migrations' LIMIT 1`,
  );

  let baselineApplied = false;
  if (hasMigrationsTable) {
    const row = sqliteQuery(
      dbPath,
      `SELECT 1 FROM "_prisma_migrations" WHERE migration_name='${BASELINE}' LIMIT 1`,
    );
    baselineApplied = Boolean(row);
  }

  if (!baselineApplied) {
    console.log(
      `[db:migrate] Existing database — marking ${BASELINE} as applied (preserves existing tables).`,
    );
    runPrisma(["migrate", "resolve", "--applied", BASELINE]);
  }
}

const args = process.argv.slice(2);
const isDev = args[0] === "--dev";
const prismaArgs = isDev ? args.slice(1) : [];

run("node", [join(root, "scripts", "db-backup.mjs")]);
ensureBaselineResolved(resolveDbPath());

if (isDev) {
  runPrisma(["migrate", "dev", ...prismaArgs]);
} else {
  runPrisma(["migrate", "deploy"]);
}

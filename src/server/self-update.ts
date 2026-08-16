import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

export type UpdateStatusName =
  | "idle"
  | "running"
  | "restarting"
  | "success"
  | "failed"
  | "needsRestart";

export type UpdateStatus = {
  status: UpdateStatusName;
  step: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  error: string | null;
  pid: number | null;
  log: string;
};

const LOCK_MS = 30 * 60 * 1000;
const LOG_TAIL_CHARS = 12_000;

function isInsideNextBuild(dir: string): boolean {
  return dir.split(/[/\\]/).includes(".next");
}

function isAppRoot(dir: string): boolean {
  return (
    !isInsideNextBuild(dir) &&
    existsSync(join(dir, "package.json")) &&
    existsSync(join(dir, "prisma", "schema.prisma")) &&
    existsSync(join(dir, "scripts", "self-update.mjs"))
  );
}

export function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (isAppRoot(dir)) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not find application root");
}

function statusPath(root: string) {
  return join(root, "data", "update-status.json");
}

function logPath(root: string) {
  return join(root, "data", "update.log");
}

function tailLog(root: string): string {
  try {
    const raw = readFileSync(logPath(root), "utf8");
    return raw.length > LOG_TAIL_CHARS ? raw.slice(-LOG_TAIL_CHARS) : raw;
  } catch {
    return "";
  }
}

function parseStatus(root: string): Omit<UpdateStatus, "log"> {
  try {
    const parsed = JSON.parse(readFileSync(statusPath(root), "utf8")) as Partial<
      Omit<UpdateStatus, "log">
    >;
    return {
      status: parsed.status ?? "idle",
      step: parsed.step ?? null,
      startedAt: parsed.startedAt ?? null,
      updatedAt: parsed.updatedAt ?? null,
      error: parsed.error ?? null,
      pid: parsed.pid ?? null,
    };
  } catch {
    return {
      status: "idle",
      step: null,
      startedAt: null,
      updatedAt: null,
      error: null,
      pid: null,
    };
  }
}

export function isUpdateLocked(status: Omit<UpdateStatus, "log">): boolean {
  if (status.status !== "running" && status.status !== "restarting") {
    return false;
  }
  const started = Date.parse(status.startedAt ?? "");
  if (!Number.isFinite(started)) return false;
  return Date.now() - started < LOCK_MS;
}

export function markUpdateStarting(): void {
  const root = findRepoRoot();
  mkdirSync(join(root, "data"), { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(
    statusPath(root),
    `${JSON.stringify(
      {
        status: "running",
        step: "pull",
        startedAt: now,
        updatedAt: now,
        error: null,
        // Script treats running + pid:null as "UI just started us"
        pid: null,
      },
      null,
      2,
    )}\n`,
  );
}

export function readUpdateStatus(): UpdateStatus {
  const root = findRepoRoot();
  return { ...parseStatus(root), log: tailLog(root) };
}

export function startSelfUpdate(): void {
  const root = findRepoRoot();
  const script = join(root, "scripts", "self-update.mjs");
  if (!existsSync(script)) {
    throw new Error("Update script is missing");
  }

  const child = spawn(process.execPath, [script], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  if (child.pid == null) {
    throw new Error("Could not start the update process");
  }
  child.unref();
}

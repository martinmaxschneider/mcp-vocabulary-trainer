#!/usr/bin/env node
/**
 * Self-update pipeline:
 * 1. git pull --rebase
 * 2. npm install
 * 3. db backup + migrate
 * 4. npm run build
 * 5. optional pm2 restart (pm_id, name, or PM2_PROCESS)
 *
 * Usage: node scripts/self-update.mjs
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

function isInsideNextBuild(dir) {
  return dir.split(/[/\\]/).includes(".next");
}

function isAppRoot(dir) {
  return (
    !isInsideNextBuild(dir) &&
    existsSync(join(dir, "package.json")) &&
    existsSync(join(dir, "prisma", "schema.prisma")) &&
    existsSync(join(dir, "scripts", "self-update.mjs"))
  );
}

function findAppRoot() {
  let dir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  for (let i = 0; i < 10; i++) {
    if (isAppRoot(dir)) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  console.error(
    "Could not find application root (need package.json + prisma/schema.prisma outside .next).",
  );
  process.exit(1);
}

const root = findAppRoot();
const dataDir = join(root, "data");
const statusPath = join(dataDir, "update-status.json");
const logPath = join(dataDir, "update.log");
const LOCK_MS = 30 * 60 * 1000;

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(join(root, ".env"));
const childEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };

function nowIso() {
  return new Date().toISOString();
}

function readStatus() {
  try {
    return JSON.parse(readFileSync(statusPath, "utf8"));
  } catch {
    return null;
  }
}

function writeStatus(partial) {
  mkdirSync(dataDir, { recursive: true });
  const prev = readStatus() ?? {};
  const next = {
    status: "idle",
    step: null,
    startedAt: prev.startedAt ?? null,
    updatedAt: nowIso(),
    error: null,
    pid: process.pid,
    ...prev,
    ...partial,
    updatedAt: nowIso(),
  };
  writeFileSync(statusPath, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

function appendLog(text) {
  mkdirSync(dataDir, { recursive: true });
  const chunk = text.endsWith("\n") ? text : `${text}\n`;
  appendFileSync(logPath, chunk);
  process.stdout.write(chunk);
}

function log(line) {
  appendLog(`[${nowIso()}] ${line}`);
}

function run(cmd, args) {
  log(`$ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    env: childEnv,
    shell: process.platform === "win32",
  });
  if (result.stdout) appendLog(result.stdout.trimEnd());
  if (result.stderr) appendLog(result.stderr.trimEnd());
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed (exit ${result.status ?? 1})`,
    );
  }
  return result;
}

function git(args) {
  return spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: childEnv,
  });
}

function isStaleLock(status) {
  if (!status || status.status !== "running") return false;
  const started = Date.parse(status.startedAt ?? "");
  if (!Number.isFinite(started)) return true;
  return Date.now() - started > LOCK_MS;
}

function fail(message) {
  log(`ERROR: ${message}`);
  writeStatus({ status: "failed", error: message, pid: null });
  process.exit(1);
}

function detectPm2Target() {
  for (const key of ["pm_id", "name", "PM2_PROCESS"]) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

function isForeignLock(status) {
  if (!status || status.status !== "running") return false;
  if (isStaleLock(status)) return false;
  // UI pre-lock: running with no pid yet — this process is the intended runner
  if (status.pid == null) return false;
  return status.pid !== process.pid;
}

function porcelainPaths(stdout) {
  return stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.slice(3).replace(/^"+|"+$/g, ""));
}

function resetPackageLock() {
  const status = git(["status", "--porcelain", "--", "package-lock.json"]);
  if (status.status !== 0 || !status.stdout.trim()) return;
  log("Resetting local package-lock.json so git pull can proceed");
  const restore = git([
    "restore",
    "--source=HEAD",
    "--worktree",
    "--staged",
    "--",
    "package-lock.json",
  ]);
  if (restore.status !== 0) {
    const checkout = git(["checkout", "HEAD", "--", "package-lock.json"]);
    if (checkout.status !== 0) {
      fail("Could not reset package-lock.json.");
    }
  }
}

try {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(logPath, "");

  const existing = readStatus();
  if (isForeignLock(existing)) {
    fail("An update is already running.");
  }

  writeStatus({
    status: "running",
    step: "pull",
    startedAt: nowIso(),
    error: null,
    pid: process.pid,
  });
  log(`Starting self-update in ${root}`);

  const inside = git(["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout.trim() !== "true") {
    fail("Not a git repository.");
  }

  resetPackageLock();

  const dirty = git(["status", "--porcelain"]);
  if (dirty.status !== 0) {
    fail("Could not read git status.");
  }
  const leftover = porcelainPaths(dirty.stdout);
  if (leftover.length > 0) {
    fail(
      `Working tree is not clean (${leftover.join(", ")}). Commit or stash local changes before updating.`,
    );
  }

  writeStatus({ step: "pull" });
  run("git", ["pull", "--rebase"]);

  writeStatus({ step: "install" });
  run("npm", ["install"]);

  writeStatus({ step: "migrate" });
  run("npm", ["run", "db:migrate"]);

  writeStatus({ step: "build" });
  run("npm", ["run", "build"]);

  const pm2Target = detectPm2Target();
  if (pm2Target) {
    writeStatus({ step: "restart", status: "restarting" });
    log(`PM2 detected — restarting ${pm2Target}`);
    run("pm2", ["restart", pm2Target]);
    writeStatus({
      status: "success",
      step: "restart",
      error: null,
      pid: null,
    });
    log("Update complete. Process restarted via PM2.");
    process.exit(0);
  }

  writeStatus({
    status: "needsRestart",
    step: "build",
    error: null,
    pid: null,
  });
  log("Update complete. PM2 is not in use — restart the process manually (npm run start).");
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  fail(message);
}

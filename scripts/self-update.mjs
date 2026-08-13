#!/usr/bin/env node
/**
 * Self-update pipeline:
 * 1. git pull --rebase
 * 2. npm install
 * 3. db backup + migrate
 * 4. npm run build
 * 5. optional pm2 restart (only if pm_id or name is set)
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

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "data");
const statusPath = join(dataDir, "update-status.json");
const logPath = join(dataDir, "update.log");
const LOCK_MS = 30 * 60 * 1000;
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
  const pmId = process.env.pm_id?.trim();
  if (pmId) return pmId;
  const name = process.env.name?.trim();
  if (name) return name;
  return null;
}

try {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(logPath, "");

  const existing = readStatus();
  if (
    existing?.status === "running" &&
    !isStaleLock(existing) &&
    existing.pid !== process.pid
  ) {
    fail("An update is already running.");
  }

  writeStatus({
    status: "running",
    step: "pull",
    startedAt: nowIso(),
    error: null,
    pid: process.pid,
  });
  log("Starting self-update");

  const inside = git(["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout.trim() !== "true") {
    fail("Not a git repository.");
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty.status !== 0) {
    fail("Could not read git status.");
  }
  if (dirty.stdout.trim()) {
    fail(
      "Working tree is not clean. Commit or stash local changes before updating.",
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

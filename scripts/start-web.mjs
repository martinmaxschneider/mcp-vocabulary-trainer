#!/usr/bin/env node
/**
 * Start the Next.js standalone server (required when output: "standalone").
 * Ensures static/public assets exist and SQLite paths stay valid after chdir.
 */
import { spawn } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  cpSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneDir = path.join(root, ".next", "standalone");
const serverJs = path.join(standaloneDir, "server.js");

if (!existsSync(serverJs)) {
  console.error(
    "[start-web] Missing .next/standalone/server.js — run `npm run build` first.",
  );
  process.exit(1);
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function ensureDirLink(src, dest) {
  if (!existsSync(src)) return;
  mkdirSync(path.dirname(dest), { recursive: true });
  if (existsSync(dest)) {
    try {
      if (lstatSync(dest).isSymbolicLink()) return;
    } catch {
      // fall through and replace
    }
    rmSync(dest, { recursive: true, force: true });
  }
  try {
    symlinkSync(src, dest, "dir");
  } catch {
    cpSync(src, dest, { recursive: true });
  }
}

ensureDirLink(
  path.join(root, ".next", "static"),
  path.join(standaloneDir, ".next", "static"),
);
ensureDirLink(path.join(root, "public"), path.join(standaloneDir, "public"));
// Standalone chdirs into .next/standalone; keep relative file:../data/... working too.
ensureDirLink(path.join(root, "data"), path.join(standaloneDir, "data"));

const fileEnv = {
  ...loadEnvFile(path.join(root, ".env")),
  ...loadEnvFile(path.join(root, ".env.production")),
};

const env = { ...fileEnv, ...process.env };
env.PORT = env.PORT || "4810";
env.HOSTNAME = env.HOSTNAME || "0.0.0.0";

const dbUrl = env.DATABASE_URL ?? "";
if (dbUrl.startsWith("file:")) {
  let filePath = dbUrl.slice("file:".length);
  const q = filePath.indexOf("?");
  if (q !== -1) filePath = filePath.slice(0, q);
  try {
    filePath = decodeURIComponent(filePath);
  } catch {
    // already a raw path
  }
  const absolute = path.isAbsolute(filePath)
    ? filePath
    : // Documented as relative to prisma/
      path.resolve(root, "prisma", filePath);
  env.DATABASE_URL = `file:${absolute}`;
  if (!existsSync(absolute)) {
    console.error(`[start-web] Database file not found: ${absolute}`);
    process.exit(1);
  }
} else if (!dbUrl) {
  console.error(
    "[start-web] DATABASE_URL is not set. Add it to .env (e.g. file:../data/sprachen.db).",
  );
  process.exit(1);
}

const child = spawn(process.execPath, [serverJs], {
  stdio: "inherit",
  env,
  cwd: root,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

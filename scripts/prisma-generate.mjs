#!/usr/bin/env node
/**
 * postinstall helper: generate the Prisma client from the real repo schema.
 * Next standalone copies package.json into .next/standalone — skip there.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

function isInsideNextBuild(dir) {
  return dir.split(/[/\\]/).includes(".next");
}

function findRoot() {
  let dir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  for (let i = 0; i < 10; i++) {
    if (!isInsideNextBuild(dir) && existsSync(join(dir, "prisma", "schema.prisma"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const root = findRoot();
if (!root) {
  console.log("[postinstall] Skipping prisma generate (no schema in this package).");
  process.exit(0);
}

const prisma = join(root, "node_modules", ".bin", "prisma");
const schema = join(root, "prisma", "schema.prisma");
const result = spawnSync(prisma, ["generate", "--schema", schema], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);

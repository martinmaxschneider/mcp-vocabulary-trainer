import path from "node:path";
import { PrismaClient } from "@prisma/client";

import { env } from "~/env";

/** Resolve SQLite `file:` URLs against the repo. Do not percent-encode spaces — Prisma treats `%20` as a literal path. */
function sqliteUrl(url: string): string {
  if (!url.startsWith("file:")) return url;
  const rest = url.slice("file:".length);
  const q = rest.indexOf("?");
  const query = q === -1 ? "" : rest.slice(q);
  let filePath = q === -1 ? rest : rest.slice(0, q);
  try {
    filePath = decodeURIComponent(filePath);
  } catch {
    // already a raw path
  }
  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), "prisma", filePath);
  return `file:${absolute}${query}`;
}

const databaseUrl = sqliteUrl(env.DATABASE_URL);

const createPrismaClient = () => {
  if (env.NODE_ENV === "development") {
    console.info("[db] sqlite", databaseUrl);
  }
  return new PrismaClient({
    log: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: { db: { url: databaseUrl } },
  });
};

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
  prismaUrl: string | undefined;
};

if (globalForPrisma.prisma && globalForPrisma.prismaUrl !== databaseUrl) {
  void globalForPrisma.prisma.$disconnect();
  globalForPrisma.prisma = undefined;
}

export const db = globalForPrisma.prisma ?? createPrismaClient();
globalForPrisma.prisma = db;
globalForPrisma.prismaUrl = databaseUrl;

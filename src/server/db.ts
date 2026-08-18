import { PrismaClient } from "@prisma/client";

import { env } from "~/env";

const createPrismaClient = () =>
  new PrismaClient({
    log:
      env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

function getClient() {
  if (env.NODE_ENV !== "production" && globalForPrisma.prisma) {
    // Drop the cached client after `prisma generate` / schema changes.
    // Otherwise Next.js HMR keeps an instance whose query engine still
    // references dropped columns (e.g. Satz.mainAudioDurationMs).
    void globalForPrisma.prisma.$disconnect();
    globalForPrisma.prisma = undefined;
  }

  const client = globalForPrisma.prisma ?? createPrismaClient();
  if (env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}

export const db = getClient();

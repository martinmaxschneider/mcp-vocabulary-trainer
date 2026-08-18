import { DomainKind, type Prisma, type PrismaClient } from "@prisma/client";
import { CANONICAL_DOMAINS } from "~/lib/domain-catalog";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function ensureCanonicalDomains(db: DbClient): Promise<{
  created: string[];
  updated: string[];
}> {
  const existing = await db.domain.findMany({
    select: { id: true, name: true, kind: true },
  });
  const byName = new Map(existing.map((d) => [d.name, d]));

  const created: string[] = [];
  const updated: string[] = [];

  for (const canonical of CANONICAL_DOMAINS) {
    const current = byName.get(canonical.name);
    if (!current) {
      await db.domain.create({
        data: {
          name: canonical.name,
          kind: canonical.kind as DomainKind,
        },
      });
      created.push(canonical.name);
      continue;
    }

    if (current.kind !== canonical.kind) {
      await db.domain.update({
        where: { id: current.id },
        data: { kind: canonical.kind as DomainKind },
      });
      updated.push(canonical.name);
    }
  }

  return { created, updated };
}

let ensurePromise: Promise<{ created: string[]; updated: string[] }> | null =
  null;

export function ensureCanonicalDomainsOnce(db: DbClient) {
  ensurePromise ??= ensureCanonicalDomains(db).catch((error) => {
    ensurePromise = null;
    throw error;
  });
  return ensurePromise;
}

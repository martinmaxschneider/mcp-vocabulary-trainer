import { MediaKind, Prisma } from "@prisma/client";
import { db } from "~/server/db";
import { normalizeMediaTitleKey } from "~/lib/media-work";

type DbClient = typeof db | Prisma.TransactionClient;

export type EnsureMediaWorkInput = {
  kind: MediaKind;
  title: string;
  creator?: string | null;
  year?: number | null;
  url?: string | null;
};

function cleanOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function ensureMediaWork(
  input: EnsureMediaWorkInput,
  client: DbClient = db,
) {
  const title = input.title.trim();
  if (!title) {
    throw new Error("MEDIA_WORK_TITLE_REQUIRED");
  }
  const titleKey = normalizeMediaTitleKey(title);
  const creator = cleanOptional(input.creator);
  const url = cleanOptional(input.url);
  const year = input.year ?? null;

  const existing = await client.mediaWork.findUnique({
    where: { kind_titleKey: { kind: input.kind, titleKey } },
  });
  if (existing) {
    const nextCreator = existing.creator || creator;
    const nextUrl = existing.url || url;
    const nextYear = existing.year ?? year;
    if (
      nextCreator !== existing.creator ||
      nextUrl !== existing.url ||
      nextYear !== existing.year
    ) {
      return client.mediaWork.update({
        where: { id: existing.id },
        data: {
          creator: nextCreator,
          url: nextUrl,
          year: nextYear,
        },
      });
    }
    return existing;
  }

  try {
    return await client.mediaWork.create({
      data: {
        kind: input.kind,
        title,
        titleKey,
        creator,
        year,
        url,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await client.mediaWork.findUnique({
        where: { kind_titleKey: { kind: input.kind, titleKey } },
      });
      if (raced) return raced;
    }
    throw error;
  }
}

export async function assertMediaWorkId(id: string, client: DbClient = db) {
  const work = await client.mediaWork.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!work) {
    throw new Error("MEDIA_WORK_NOT_FOUND");
  }
}

import type { Prisma } from "@prisma/client";
import { flattenConjugationsJson } from "~/lib/conjugation-catalog";
import type { db } from "~/server/db";

type DbClient = typeof db | Prisma.TransactionClient;

export async function replaceConjugationForms(
  client: DbClient,
  translationId: string,
  forms: Array<{ tenseKey: string; personIndex: number; form: string }>
) {
  await client.conjugationForm.deleteMany({ where: { translationId } });
  if (forms.length === 0) return;

  await client.conjugationForm.createMany({
    data: forms.map((f) => ({
      translationId,
      tenseKey: f.tenseKey,
      personIndex: f.personIndex,
      form: f.form,
    })),
  });
}

/** Sync normalized rows from legacy JSON conjugations blob. */
export async function syncConjugationFormsFromJson(
  client: DbClient,
  translationId: string,
  lang: string,
  conjugations: unknown
) {
  const rows = flattenConjugationsJson(
    lang,
    conjugations as Record<string, unknown> | null | undefined
  );
  await replaceConjugationForms(client, translationId, rows);
}

export async function upsertConjugationFormRows(
  client: DbClient,
  translationId: string,
  forms: Array<{ tenseKey: string; personIndex: number; form: string }>
) {
  for (const f of forms) {
    const trimmed = f.form.trim();
    if (!trimmed) {
      await client.conjugationForm.deleteMany({
        where: {
          translationId,
          tenseKey: f.tenseKey,
          personIndex: f.personIndex,
        },
      });
      continue;
    }

    await client.conjugationForm.upsert({
      where: {
        translationId_tenseKey_personIndex: {
          translationId,
          tenseKey: f.tenseKey,
          personIndex: f.personIndex,
        },
      },
      create: {
        translationId,
        tenseKey: f.tenseKey,
        personIndex: f.personIndex,
        form: trimmed,
      },
      update: { form: trimmed },
    });
  }
}

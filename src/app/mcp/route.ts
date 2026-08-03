// MCP-Endpoint (Streamable HTTP) unter /mcp — für ChatGPT via OpenAI Secure MCP Tunnel.
// Persistenz only: CRUD, Konjugationen (ConjugationForm), Review, Leitner, Stats. Keine KI.
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { EntryType, WordCategory } from "@prisma/client";
import type { TRPCRequestInfo } from "@trpc/server/http";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { createEntryInputSchema } from "~/server/api/routers/entry";
import { conjugationsSchema } from "~/lib/schemas/translation";
import { MAX_BOX, MIN_BOX } from "~/lib/leitner";
import { SOURCE_LANG } from "~/lib/languages";

async function getCaller() {
  const ctx = await createTRPCContext({
    req: new Request("http://localhost:4810/mcp"),
    resHeaders: new Headers(),
    info: {
      isBatchCall: false,
      calls: [],
      accept: null,
      type: "unknown",
      connectionParams: null,
      signal: new AbortController().signal,
      url: null,
    } as TRPCRequestInfo,
  });
  return createCaller(ctx);
}

function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

const translationToolSchema = {
  lang: z.string(),
  regionTag: z.string().optional(),
  text: z.string().min(1),
  variants: z.array(z.string()).optional(),
  example: z.string().optional(),
  ipa: z.string().optional(),
  audioUrl: z.string().optional(),
  /** Unregelmäßig in dieser Zielsprache (nicht global am Verb). */
  isIrregular: z.boolean().optional(),
  /**
   * Optionaler Legacy-Write: sync't zu ConjugationForm.
   * Bevorzugt: upsert_conjugation_forms + get_conjugation_catalog.
   */
  conjugations: conjugationsSchema,
};

const conjugationFormInputSchema = z.object({
  tenseKey: z.string().min(1),
  personIndex: z.number().int().min(0).max(20),
  form: z.string(),
});

const entryToolSchema = {
  type: z.nativeEnum(EntryType),
  category: z.nativeEnum(WordCategory).optional(),
  mainLang: z.string().default(SOURCE_LANG.code),
  mainText: z.string().min(1),
  note: z.string().optional(),
  domainId: z.string().optional(),
  domainIds: z.array(z.string()).optional(),
  translations: z.array(z.object(translationToolSchema)).min(1),
};

const handler = createMcpHandler(
  (server) => {
    // ── Domains ──────────────────────────────────────────────
    server.tool(
      "list_domains",
      "Listet alle Themen (Domains) mit entryCount, dueCount und newCount. " +
        "dueCount/newCount beziehen sich auf targetLang (default: en).",
      { targetLang: z.string().default("en") },
      async ({ targetLang }) => {
        const api = await getCaller();
        return jsonResult(await api.domain.list({ targetLang }));
      },
    );

    server.tool(
      "create_domain",
      "Legt eine Domain/Thema an. Idempotent: existiert der Name bereits, wird keine zweite erzeugt.",
      { name: z.string().min(1).max(100) },
      async ({ name }) => {
        const api = await getCaller();
        return jsonResult(await api.domain.create({ name }));
      },
    );

    server.tool(
      "update_domain",
      "Benennt eine Domain um (Unique-Name).",
      { id: z.string(), name: z.string().min(1).max(100) },
      async ({ id, name }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.domain.rename({ id, name }));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "delete_domain",
      "Löscht eine Domain. Domain-Zuordnungen werden entfernt; Entries bleiben erhalten.",
      { id: z.string() },
      async ({ id }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.domain.remove({ id }));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── Entries ──────────────────────────────────────────────
    server.tool(
      "search_entries",
      "Sucht Einträge nach Teilstring im Quellwort (mainText/Muttersprache) oder Übersetzung. " +
        "Vor create_entry nutzen, um Dubletten zu erkennen.",
      { query: z.string().min(1), limit: z.number().min(1).max(50).default(20) },
      async ({ query, limit }) => {
        const api = await getCaller();
        return jsonResult(await api.entry.search({ query, limit }));
      },
    );

    server.tool(
      "create_entry",
      "Legt einen Vokabeleintrag an (Typ, Kategorie, mainText, Übersetzungen, Domains). " +
        "Pro Übersetzung optional isIrregular (unregelmäßig in dieser Sprache). " +
        "conjugations-JSON sync't zu ConjugationForm; für gezielte Pflege lieber upsert_conjugation_forms nutzen.",
      entryToolSchema,
      async (args) => {
        const api = await getCaller();
        const parsed = createEntryInputSchema.parse(args);
        try {
          return jsonResult(await api.entry.createManual(parsed));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "create_entries",
      "Bulk-Anlage mehrerer Vokabeleinträge (max. 50). Für Listen wie „30 Auto-Vokabeln“.",
      {
        entries: z.array(z.object(entryToolSchema)).min(1).max(50),
      },
      async ({ entries }) => {
        const api = await getCaller();
        const parsed = z.array(createEntryInputSchema).parse(entries);
        try {
          return jsonResult(await api.entry.createMany({ entries: parsed }));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "update_entry",
      "Aktualisiert Text, Kategorie, Domains und/oder Übersetzungen " +
        "(IPA, Beispiel, isIrregular, optionales conjugations-JSON → ConjugationForm).",
      {
        id: z.string(),
        mainText: z.string().min(1).optional(),
        note: z.string().optional(),
        category: z.nativeEnum(WordCategory).nullish(),
        domainIds: z.array(z.string()).optional(),
        translationsUpsert: z
          .array(
            z.object({
              ...translationToolSchema,
              id: z.string().optional(),
            }),
          )
          .optional(),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.entry.update(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "delete_entry",
      "Löscht einen Vokabeleintrag inkl. Übersetzungen und Progress.",
      { id: z.string() },
      async ({ id }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.entry.delete({ id }));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "get_entry",
      "Liefert Entry-Details inkl. Übersetzungen (isIrregular), Domains und " +
        "conjugationsByLang (normalisierte ConjugationForm + Katalog-Profil pro Sprache).",
      { id: z.string() },
      async ({ id }) => {
        const api = await getCaller();
        const entry = await api.entry.getById({ id });
        if (!entry) return errorResult(`Entry ${id} not found`);

        let conjugationsByLang = null;
        if (entry.category === WordCategory.VERB) {
          try {
            const conj = await api.conjugation.getForEntry({ entryId: id });
            conjugationsByLang = conj.languages;
          } catch {
            conjugationsByLang = null;
          }
        }

        return jsonResult({ ...entry, conjugationsByLang });
      },
    );

    // ── Conjugations ─────────────────────────────────────────
    server.tool(
      "get_conjugation_catalog",
      "Sprachkatalog: erlaubte Zeiten und Personen für en/es/fr (Code-Config). " +
        "Optional lang filtern. Vor upsert_conjugation_forms nutzen.",
      { lang: z.string().optional() },
      async ({ lang }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.conjugation.getCatalog(lang ? { lang } : undefined));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "get_entry_conjugations",
      "Liefert ConjugationForm-Zeilen und Katalog-Profil für ein Verb (entryId), optional gefiltert nach lang.",
      {
        entryId: z.string(),
        lang: z.string().optional(),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.conjugation.getForEntry(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "set_translation_irregular",
      "Setzt isIrregular für eine Übersetzung (unregelmäßig in genau dieser Zielsprache).",
      {
        translationId: z.string(),
        isIrregular: z.boolean(),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.conjugation.setIrregular(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "upsert_conjugation_forms",
      "Schreibt Verbformen (tenseKey + personIndex + form) für eine Übersetzung. " +
        "Nur Katalog-Zeiten/Personen der Sprache; leere form löscht den Slot. " +
        "Zuerst get_conjugation_catalog prüfen.",
      {
        translationId: z.string(),
        forms: z.array(conjugationFormInputSchema),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.conjugation.upsertForms(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "assign_entries_to_domain",
      "Ordnet bestehende Einträge einer Domain zu (ohne andere Domains zu entfernen).",
      {
        domainId: z.string(),
        entryIds: z.array(z.string()).min(1),
      },
      async ({ domainId, entryIds }) => {
        const api = await getCaller();
        try {
          return jsonResult(
            await api.entry.assignEntriesToDomain({ domainId, entryIds }),
          );
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "remove_entries_from_domain",
      "Entfernt Domain-Zuordnungen. Die Entries selbst bleiben erhalten.",
      {
        domainId: z.string(),
        entryIds: z.array(z.string()).min(1),
      },
      async ({ domainId, entryIds }) => {
        const api = await getCaller();
        try {
          return jsonResult(
            await api.entry.removeEntriesFromDomain({ domainId, entryIds }),
          );
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── Review ───────────────────────────────────────────────
    server.tool(
      "get_due_cards",
      "Liefert ausschließlich fällige Übungskarten (ohne Lösungstext). Filter: targetLang, optional domainIds.",
      {
        targetLang: z.string(),
        domainIds: z.array(z.string()).optional(),
        limit: z.number().min(1).max(100).default(20),
      },
      async ({ targetLang, domainIds, limit }) => {
        const api = await getCaller();
        const result = await api.review.getDue({ targetLang, domainIds, limit });
        return jsonResult({
          totalAvailable: result.totalAvailable,
          cards: result.cards.map(({ translation: _t, ...card }) => card),
        });
      },
    );

    server.tool(
      "list_cards",
      "Flexible Kartensuche ohne Lösung. Filter: targetLang, domainIds, dueOnly, box/boxes.",
      {
        targetLang: z.string(),
        domainIds: z.array(z.string()).optional(),
        dueOnly: z.boolean().optional(),
        box: z.number().int().min(MIN_BOX).max(MAX_BOX).optional(),
        boxes: z.array(z.number().int().min(MIN_BOX).max(MAX_BOX)).optional(),
        limit: z.number().min(1).max(100).default(20),
      },
      async (args) => {
        const api = await getCaller();
        return jsonResult(await api.review.listCards(args));
      },
    );

    server.tool(
      "submit_answer",
      "Bewertet eine Antwort serverseitig (Matching), aktualisiert Leitner-Box, Progress und ReviewLog.",
      {
        entryId: z.string(),
        targetLang: z.string(),
        userAnswer: z.string(),
      },
      async ({ entryId, targetLang, userAnswer }) => {
        const api = await getCaller();
        try {
          const result = await api.review.submitAnswer({
            entryId,
            targetLang,
            userAnswer,
          });
          return jsonResult({
            correct: result.correct,
            boxBefore: result.boxBefore,
            boxAfter: result.boxAfter,
            nextReviewAt: result.nextReviewAt,
            expected: result.expectedAnswers,
            typo: result.typo,
            correctCount: result.correctCount,
            wrongCount: result.wrongCount,
          });
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "mark_as_wrong",
      "Korrigiert eine fälschlich akzeptierte Antwort (z. B. Transkriptionsfehler) als falsch.",
      {
        entryId: z.string(),
        targetLang: z.string(),
      },
      async ({ entryId, targetLang }) => {
        const api = await getCaller();
        try {
          const result = await api.review.markAsWrong({ entryId, targetLang });
          return jsonResult({
            correct: false,
            boxBefore: result.boxBefore,
            boxAfter: result.boxAfter,
            nextReviewAt: result.nextReviewAt,
            expected: result.expectedAnswers,
            correctCount: result.correctCount,
            wrongCount: result.wrongCount,
          });
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "set_card_box",
      "Setzt manuell die Leitner-Box (1–6). Nur für Korrekturen; normalerweise submit_answer nutzen.",
      {
        entryId: z.string(),
        targetLang: z.string(),
        box: z.number().int().min(MIN_BOX).max(MAX_BOX),
        reschedule: z.boolean().default(true),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.review.setBox(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "get_card_history",
      "Liefert Review-Historie, Richtig/Falsch-Zähler und aktuellen Leitner-Status einer Karte.",
      {
        entryId: z.string(),
        targetLang: z.string(),
        limit: z.number().min(1).max(100).default(20),
      },
      async (args) => {
        const api = await getCaller();
        return jsonResult(await api.review.getCardHistory(args));
      },
    );

    // ── Stats ────────────────────────────────────────────────
    server.tool(
      "get_stats",
      "Dashboard-Statistik: fällige Karten, Box-Verteilung, Leeches, Domain-Übersicht.",
      {},
      async () => {
        const api = await getCaller();
        return jsonResult(await api.stats.dashboard());
      },
    );
  },
  {
    serverInfo: {
      name: "sprachen",
      version: "1.0.0",
    },
  },
  {
    basePath: "",
    verboseLogs: false,
    maxDuration: 120,
  },
);

export { handler as GET, handler as POST, handler as DELETE };

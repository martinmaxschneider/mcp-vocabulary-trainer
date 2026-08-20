// MCP-Endpoint (Streamable HTTP) unter /mcp — für ChatGPT via OpenAI Secure MCP Tunnel.
// Persistenz only: CRUD, Konjugationen, Review, Leitner, Grammatik, Arbeitsblätter, Stats. Keine KI.
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  AudioStatus,
  EntryType,
  SatzPriority,
  SatzRegister,
  SatzSource,
  ShadowingStatus,
  WordCategory,
  WorksheetStatus,
} from "@prisma/client";
import type { TRPCRequestInfo } from "@trpc/server/http";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { createEntryInputSchema } from "~/server/api/routers/entry";
import { createSatzInputSchema } from "~/server/api/routers/satz";
import { pronunciationGuideItemInputSchema } from "~/server/api/routers/pronunciation";
import { grammarBlockInputSchema } from "~/server/api/routers/grammar";
import { worksheetQuestionInputSchema } from "~/lib/schemas/worksheet";
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
  allowSimilar: z.boolean().optional(),
};

const handler = createMcpHandler(
  (server) => {
    // ── Domains ──────────────────────────────────────────────
    server.tool(
      "list_domains",
      "Listet alle Domains mit kind (THEME | GRAMMAR | SPECIAL), entryCount, wordCount, verbCount, satzCount, dueCount und newCount. " +
        "THEME = Alltagsthemen (Vokabeln und Sätze), GRAMMAR = Wortart-/Grammatik-Buckets, SPECIAL = Redewendungen. " +
        "dueCount/newCount beziehen sich auf targetLang (default: en).",
      { targetLang: z.string().default("en") },
      async ({ targetLang }) => {
        const api = await getCaller();
        return jsonResult(await api.domain.list({ targetLang }));
      },
    );

    server.tool(
      "create_domain",
      "Legt eine Domain an. kind: THEME (Standard, Alltagsthema), GRAMMAR (Wortart-Bucket) oder SPECIAL. " +
        "Idempotent: existiert der Name bereits, wird keine zweite erzeugt.",
      {
        name: z.string().min(1).max(100),
        kind: z.enum(["THEME", "GRAMMAR", "SPECIAL"]).optional(),
      },
      async ({ name, kind }) => {
        const api = await getCaller();
        return jsonResult(await api.domain.create({ name, kind }));
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

    // ── Sätze ────────────────────────────────────────────────
    const satzTranslationToolSchema = {
      lang: z.string().min(1),
      text: z.string().min(1),
      register: z.nativeEnum(SatzRegister).optional(),
      audioUrl: z.string().optional(),
      audioStatus: z.nativeEnum(AudioStatus).optional(),
    };

    const satzToolSchema = {
      mainLang: z.string().default(SOURCE_LANG.code),
      mainText: z.string().min(1),
      trigger: z.string().optional(),
      source: z.nativeEnum(SatzSource).optional(),
      priority: z.nativeEnum(SatzPriority).optional(),
      shadowingStatus: z.nativeEnum(ShadowingStatus).optional(),
      answerToId: z.string().optional(),
      domainId: z.string().optional(),
      domainIds: z.array(z.string()).optional(),
      linkedEntryIds: z.array(z.string()).optional(),
      grammarTopicIds: z.array(z.string()).optional(),
      translations: z.array(z.object(satzTranslationToolSchema)).min(1),
      allowSimilar: z.boolean().optional(),
    };

    server.tool(
      "search_saetze",
      "Sucht Sätze nach Teilstring in mainText, trigger oder Übersetzung.",
      { query: z.string().min(1), limit: z.number().min(1).max(50).default(20) },
      async ({ query, limit }) => {
        const api = await getCaller();
        return jsonResult(await api.satz.search({ query, limit }));
      },
    );

    server.tool(
      "list_saetze",
      "Listet Sätze (optional gefiltert nach domainId, source, priority, shadowingStatus, box+targetLang, query).",
      {
        domainId: z.string().optional(),
        source: z.nativeEnum(SatzSource).optional(),
        priority: z.nativeEnum(SatzPriority).optional(),
        shadowingStatus: z.nativeEnum(ShadowingStatus).optional(),
        box: z.number().int().min(MIN_BOX).max(MAX_BOX).optional(),
        targetLang: z.string().optional(),
        query: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        cursor: z.string().optional(),
      },
      async (args) => {
        const api = await getCaller();
        return jsonResult(await api.satz.list(args));
      },
    );

    server.tool(
      "get_satz",
      "Lädt einen Satz mit Übersetzungen, Themen, verknüpften Vokabeln und Grammatik-Kapiteln.",
      { id: z.string() },
      async ({ id }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.satz.getById({ id }));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "create_satz",
      "Legt einen Satz an (deutscher mainText, Übersetzungen nur für aktive Zielsprachen, optional trigger/source/priority). " +
        "domainIds nur THEME oder SPECIAL (nicht Grammatik-Buckets). " +
        "linkedEntryIds = Vokabeln im Satz, grammarTopicIds = Grammatik-Kapitel. " +
        "register pro Übersetzung: INFORMAL (Standard) oder FORMAL. " +
        "Vor dem Speichern: Embedding-Ähnlichkeit gegen bestehende Sätze. Bei vermutetem Duplikat kommt created:false mit candidates — dann allowSimilar:true setzen.",
      satzToolSchema,
      async (args) => {
        const api = await getCaller();
        const parsed = createSatzInputSchema.parse(args);
        try {
          return jsonResult(await api.satz.create(parsed));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "update_satz",
      "Aktualisiert einen Satz. translations ersetzt die komplette Übersetzungsliste, wenn gesetzt. " +
        "domainIds / linkedEntryIds / grammarTopicIds ersetzen die jeweilige Zuordnung, wenn gesetzt.",
      {
        id: z.string(),
        mainText: z.string().min(1).optional(),
        trigger: z.string().nullable().optional(),
        source: z.nativeEnum(SatzSource).optional(),
        priority: z.nativeEnum(SatzPriority).optional(),
        shadowingStatus: z.nativeEnum(ShadowingStatus).optional(),
        answerToId: z.string().nullable().optional(),
        domainIds: z.array(z.string()).optional(),
        linkedEntryIds: z.array(z.string()).optional(),
        grammarTopicIds: z.array(z.string()).optional(),
        translations: z.array(z.object(satzTranslationToolSchema)).optional(),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.satz.update(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "delete_satz",
      "Löscht einen Satz inkl. Übersetzungen und Zuordnungen. Verknüpfte Vokabeln bleiben erhalten.",
      { id: z.string() },
      async ({ id }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.satz.delete({ id }));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "assign_satz_domains",
      "Ersetzt die Themen-Zuordnung eines Satzes (nur THEME/SPECIAL).",
      { satzId: z.string(), domainIds: z.array(z.string()) },
      async ({ satzId, domainIds }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.satz.assignDomains({ satzId, domainIds }));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "assign_satz_entries",
      "Ersetzt die Vokabel-Verknüpfungen eines Satzes (linkedEntryIds).",
      { satzId: z.string(), entryIds: z.array(z.string()) },
      async ({ satzId, entryIds }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.satz.assignEntries({ satzId, entryIds }));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "assign_satz_grammar_topics",
      "Ersetzt die Grammatik-Kapitel-Verknüpfungen eines Satzes.",
      { satzId: z.string(), grammarTopicIds: z.array(z.string()) },
      async ({ satzId, grammarTopicIds }) => {
        const api = await getCaller();
        try {
          return jsonResult(
            await api.satz.assignGrammarTopics({ satzId, grammarTopicIds }),
          );
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "suggest_satz_question",
      "Schlägt vor, ob ein Satz eine Antwort ist, und sucht passende bestehende Fragen (nur Frageform-Sätze).",
      { mainText: z.string().min(1), excludeId: z.string().optional() },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.satz.suggestQuestion(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "request_satz_audio",
      "Markiert Übersetzungen ausgewählter Sätze (optional inkl. verknüpfter Fragen) für TTS. Danach process_satz_audio.",
      {
        satzIds: z.array(z.string()).min(1),
        includeQuestions: z.boolean().optional(),
        langs: z.array(z.string()).optional(),
        regenerate: z.boolean().optional(),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.satz.requestAudio(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "request_entry_audio",
      "Markiert Vokabel-Haupt- und Übersetzungs-Audios für TTS. Danach process_satz_audio (gemeinsame Queue).",
      {
        entryIds: z.array(z.string()).min(1),
        langs: z.array(z.string()).optional(),
        regenerate: z.boolean().optional(),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.entry.requestAudio(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "request_paradigm_audio",
      "Markiert Konjugations-Paradigmen (Verb+Zeit) für TTS. Danach process_satz_audio.",
      {
        items: z
          .array(
            z.object({
              translationId: z.string(),
              tenseKey: z.string().min(1),
            }),
          )
          .min(1),
        regenerate: z.boolean().optional(),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.conjugation.requestParadigmAudio(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "process_satz_audio",
      "Erzeugt die nächsten angeforderten Satz-Audios (OpenAI TTS) und speichert sie lokal.",
      { limit: z.number().min(1).max(10).default(2) },
      async ({ limit }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.satz.processAudio({ limit }));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "get_satz_review_queue",
      "Liefert fällige Satz-Karten für Active Recall (Selbstbewertung). Filter: targetLang, optional domainId, priority, box.",
      {
        targetLang: z.string(),
        domainId: z.string().optional(),
        priority: z.nativeEnum(SatzPriority).optional(),
        box: z.number().int().min(MIN_BOX).max(MAX_BOX).optional(),
        limit: z.number().min(1).max(100).default(20),
      },
      async (args) => {
        const api = await getCaller();
        const result = await api.satzReview.queue(args);
        return jsonResult({
          totalAvailable: result.totalAvailable,
          boxCounts: result.boxCounts,
          cards: result.cards.map(({ translation: _t, ...card }) => card),
        });
      },
    );

    server.tool(
      "grade_satz_review",
      "Selbstbewertung einer Satz-Karte: isCorrect bewegt die Leitner-Box (kein Tipp-Abgleich).",
      {
        satzId: z.string(),
        targetLang: z.string(),
        isCorrect: z.boolean(),
      },
      async (args) => {
        const api = await getCaller();
        try {
          const result = await api.satzReview.grade(args);
          return jsonResult({
            correct: result.isCorrect,
            boxBefore: result.boxBefore,
            boxAfter: result.boxAfter,
            nextReviewAt: result.nextReviewAt,
            expected: result.expected,
            correctCount: result.correctCount,
            wrongCount: result.wrongCount,
          });
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "import_saetze_csv",
      "Lädt eine CSV (Spalten Nummer + deutscher Satz) als Staging-Batch. " +
        "Nur targetLang wird übersetzt. Noch keine echten Sätze — danach enrich_satz_import und commit_satz_import.",
      {
        csvText: z.string().min(1),
        filename: z.string().optional(),
        targetLang: z.string().optional(),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.satzImport.uploadCsv(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "enrich_satz_import",
      "Reichert die nächsten Drafts eines Satz-Imports an (Duplikat-Check, Übersetzung, Themen, Vokabeln, Frage-Vorschlag). " +
        "Wechselt die natürliche Übersetzung die Konstruktion (z. B. „gibt es“ → „vous avez“), liefert der Draft adjustedSource: einen deutschen Satz, der zur Übersetzung passt.",
      {
        batchId: z.string(),
        limit: z.number().min(1).max(10).default(2),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.satzImport.enrichNext(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "get_satz_import",
      "Status und Drafts eines Satz-Import-Batches (Review vor dem Commit).",
      { id: z.string() },
      async ({ id }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.satzImport.getBatch({ id }));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "commit_satz_import",
      "Schreibt geprüfte Drafts als echte Sätze. Nur ready-Zeilen (Übersetzung vorhanden, Duplikate nur mit allowSimilar).",
      {
        batchId: z.string(),
        draftIds: z.array(z.string()).optional(),
        limit: z.number().min(1).max(20).default(2),
      },
      async (args) => {
        const api = await getCaller();
        try {
          const createdIds: string[] = [];
          let remaining = 1;
          let status = "REVIEW";
          while (remaining > 0) {
            const result = await api.satzImport.commit(args);
            createdIds.push(...result.createdIds);
            remaining = result.remaining;
            status = result.status;
            if (result.createdCount === 0) break;
          }
          return jsonResult({
            createdCount: createdIds.length,
            createdIds,
            remaining,
            status,
          });
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── Entries ──────────────────────────────────────────────
    server.tool(
      "search_entries",
      "Sucht Einträge nach Teilstring im Quellwort (mainText/Muttersprache) oder Übersetzung. " +
        "create_entry prüft zusätzlich semantische Ähnlichkeit per Embedding (nicht den ganzen Bestand als Text). " +
        "Für eine Vorab-Prüfung ohne Anlegen: find_similar_entries.",
      { query: z.string().min(1), limit: z.number().min(1).max(50).default(20) },
      async ({ query, limit }) => {
        const api = await getCaller();
        return jsonResult(await api.entry.search({ query, limit }));
      },
    );

    server.tool(
      "find_similar_entries",
      "Semantische Nachbarn zu einem Quelltext (Embedding + Cosine). " +
        "Liefert Top-Treffer mit Score; kein LLM, kein Anlegen. " +
        "Zum Kalibrieren und als Vorab-Check vor create_entry.",
      {
        query: z.string().min(1),
        limit: z.number().min(1).max(20).default(5),
      },
      async ({ query, limit }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.entry.findSimilar({ query, limit }));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "create_entry",
      "Legt einen Vokabeleintrag an (Typ, Kategorie, mainText, Übersetzungen, Domains). " +
        "Jede Übersetzung SOLL ipa mitliefern (IPA der Zielübersetzung in Slash-Notation, z.B. /həˈloʊ/). " +
        "Pro Übersetzung optional isIrregular (unregelmäßig in dieser Sprache). " +
        "conjugations-JSON sync't zu ConjugationForm; für gezielte Pflege lieber upsert_conjugation_forms nutzen. " +
        "Vor dem Speichern: Embedding-Ähnlichkeit gegen den Bestand. Bei vermutetem Duplikat kommt created:false mit candidates — dann allowSimilar:true setzen, um trotzdem anzulegen.",
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
      "Bulk-Anlage mehrerer Vokabeleinträge (max. 50). Für Listen wie „30 Auto-Vokabeln“. " +
        "Jede Übersetzung SOLL ipa mitliefern (IPA in Slash-Notation). " +
        "Semantische Dubletten landen in skipped (reason: similar), der Rest wird angelegt. " +
        "Pro Eintrag allowSimilar:true, um eine erkannte Ähnlichkeit zu ignorieren.",
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
      "list_translations_missing_ipa",
      "Listet Übersetzungen ohne IPA (null oder leer) für die Migration. " +
        "Danach IPA erzeugen und mit update_translations_ipa speichern; mit nextCursor paginieren bis leer.",
      {
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
        lang: z.string().optional(),
      },
      async ({ limit, cursor, lang }) => {
        const api = await getCaller();
        try {
          return jsonResult(
            await api.entry.listTranslationsMissingIpa({ limit, cursor, lang }),
          );
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "update_translations_ipa",
      "Bulk-Update nur für IPA (max. 100). Input: updates[{ id: translationId, ipa }]. " +
        "Typischer Flow: list_translations_missing_ipa → IPA liefern → dieses Tool.",
      {
        updates: z
          .array(
            z.object({
              id: z.string(),
              ipa: z.string().min(1),
            }),
          )
          .min(1)
          .max(100),
      },
      async ({ updates }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.entry.updateTranslationsIpa({ updates }));
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
      "mark_as_correct",
      "Korrigiert eine fälschlich abgelehnte Antwort als richtig und speichert sie ggf. als Variante.",
      {
        entryId: z.string(),
        targetLang: z.string(),
      },
      async ({ entryId, targetLang }) => {
        const api = await getCaller();
        try {
          const result = await api.review.markAsCorrect({ entryId, targetLang });
          return jsonResult({
            correct: true,
            boxBefore: result.boxBefore,
            boxAfter: result.boxAfter,
            nextReviewAt: result.nextReviewAt,
            expected: result.expectedAnswers,
            correctCount: result.correctCount,
            wrongCount: result.wrongCount,
            addedVariant: result.addedVariant,
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

    // ── Pronunciation guides (native → target) ───────────────
    server.tool(
      "list_pronunciation_guides",
      "Listet alle Aussprache-Cheat-Sheets (Sprachpaar Muttersprache→Zielsprache) mit itemCount.",
      {},
      async () => {
        const api = await getCaller();
        return jsonResult(await api.pronunciation.list());
      },
    );

    server.tool(
      "get_pronunciation_guide",
      "Lädt das Aussprache-Cheat-Sheet für ein Sprachpaar inkl. Items " +
        "(symbol/IPA, approx, explanation in Muttersprache). " +
        "nativeLang default = App-Muttersprache.",
      {
        nativeLang: z.string().optional(),
        targetLang: z.string(),
      },
      async ({ nativeLang, targetLang }) => {
        const api = await getCaller();
        const guide = await api.pronunciation.getByPair({
          nativeLang,
          targetLang,
        });
        if (!guide) {
          return errorResult(
            `No pronunciation guide for ${nativeLang ?? SOURCE_LANG.code}→${targetLang}`,
          );
        }
        return jsonResult(guide);
      },
    );

    server.tool(
      "upsert_pronunciation_guide",
      "Speichert/ersetzt die volle Aussprache-Liste für ein Sprachpaar (Initial-Fill). " +
        "Items: symbol = IPA/Laut der Zielsprache; approx + explanation in der Muttersprache. " +
        "Replace-Semantik: bestehende Items werden durch die Payload ersetzt.",
      {
        nativeLang: z.string().default(SOURCE_LANG.code),
        targetLang: z.string(),
        items: z.array(pronunciationGuideItemInputSchema).max(500),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.pronunciation.upsertGuide(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "upsert_pronunciation_guide_items",
      "Merged einzelne Aussprache-Einträge (nach symbol) in ein Sprachpaar. " +
        "Legt den Guide an, falls er noch nicht existiert.",
      {
        nativeLang: z.string().default(SOURCE_LANG.code),
        targetLang: z.string(),
        items: z
          .array(pronunciationGuideItemInputSchema)
          .min(1)
          .max(100),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.pronunciation.upsertItems(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "delete_pronunciation_guide",
      "Löscht das Aussprache-Cheat-Sheet für ein Sprachpaar inkl. aller Items.",
      {
        nativeLang: z.string().optional(),
        targetLang: z.string(),
      },
      async ({ nativeLang, targetLang }) => {
        const api = await getCaller();
        try {
          return jsonResult(
            await api.pronunciation.deleteGuide({ nativeLang, targetLang }),
          );
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── Grammar reference (cheat sheets; content via chat) ───
    server.tool(
      "list_grammar_topics",
      "Listet Grammatik-Kapitel einer Zielsprache (id, title, summary, category, slug, keywords). " +
        "Vor create immer prüfen, ob das Thema schon existiert. " +
        "Bei „ich möchte X lernen/wiederholen“ zuerst listen/suchen, dann get_grammar_topic laden.",
      {
        targetLang: z.string(),
      },
      async ({ targetLang }) => {
        const api = await getCaller();
        return jsonResult(await api.grammar.listByLang({ targetLang }));
      },
    );

    server.tool(
      "search_grammar_topics",
      "Sucht Grammatik-Kapitel einer Zielsprache nach Titel/Summary/Slug/Keywords " +
        "(z.B. „Possessiv“, „ser“, „Artikel“). " +
        "Bei Lernwunsch zuerst search/list, dann get — Inhalt aus der DB als Gesprächsgrundlage nutzen, nicht neu erfinden.",
      {
        targetLang: z.string(),
        query: z.string().min(1),
      },
      async (args) => {
        const api = await getCaller();
        return jsonResult(await api.grammar.search(args));
      },
    );

    server.tool(
      "get_grammar_topic",
      "Lädt ein Grammatik-Kapitel inkl. Blöcke (RULE / EXAMPLES / NOTE). " +
        "Erklärungen in der Muttersprache, Beispiele mit native↔target. " +
        "Nutze dies als Kontext zum Diskutieren und Üben; speichere individuelle Klarstellungen nur nach Rückfrage via upsert_grammar_blocks.",
      {
        id: z.string().optional(),
        targetLang: z.string().optional(),
        slug: z.string().optional(),
      },
      async ({ id, targetLang, slug }) => {
        const api = await getCaller();
        try {
          if (id) {
            return jsonResult(await api.grammar.getById({ id }));
          }
          if (targetLang && slug) {
            return jsonResult(await api.grammar.getBySlug({ targetLang, slug }));
          }
          return errorResult("Provide id, or targetLang + slug");
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "create_grammar_topic",
      "Legt ein neues Grammatik-Kapitel an. WICHTIG: Vorher immer nachfragen " +
        "(„Soll ich das als Grammatik-Kapitel speichern?“). Zuerst list/search gegen Duplikate. " +
        "Struktur kurz und klar: RULE (2–4 Sätze), EXAMPLES (Tabelle native/target), optional NOTE (Merksatz). " +
        "category z.B. basics|verbs|pronouns|word_order|adjectives|prepositions. " +
        "slug optional (kebab-case); sonst aus title abgeleitet. Erklärungen in Muttersprache.",
      {
        targetLang: z.string(),
        category: z.string(),
        title: z.string(),
        summary: z.string(),
        slug: z.string().optional(),
        keywords: z.array(z.string()).optional(),
        sortOrder: z.number().int().optional(),
        blocks: z.array(grammarBlockInputSchema).min(1).max(50),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.grammar.create(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "update_grammar_topic",
      "Aktualisiert Metadaten und/oder ersetzt alle Blöcke eines Grammatik-Kapitels (große Überarbeitung). " +
        "Vor dem Speichern kurz nachfragen. Für kleine Tweaks (einen Merksatz anhängen) lieber upsert_grammar_blocks.",
      {
        id: z.string(),
        targetLang: z.string().optional(),
        category: z.string().optional(),
        slug: z.string().optional(),
        title: z.string().optional(),
        summary: z.string().optional(),
        keywords: z.array(z.string()).optional(),
        sortOrder: z.number().int().optional(),
        blocks: z.array(grammarBlockInputSchema).min(1).max(50).optional(),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.grammar.update(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "upsert_grammar_blocks",
      "Fügt Blöcke hinzu oder aktualisiert bestehende (per block.id) — für individuelle Anpassungen " +
        "(eigener Merksatz, extra Beispiele), ohne das ganze Kapitel neu zu schreiben. " +
        "Vor dem Speichern nachfragen („Soll ich das ans Kapitel anhängen?“). " +
        "Neue Blöcke ohne id werden angehängt. type: RULE | EXAMPLES | NOTE.",
      {
        topicId: z.string(),
        blocks: z.array(grammarBlockInputSchema).min(1).max(50),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.grammar.upsertBlocks(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "delete_grammar_topic",
      "Löscht ein Grammatik-Kapitel inkl. aller Blöcke. Vorher nachfragen.",
      {
        id: z.string(),
      },
      async ({ id }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.grammar.delete({ id }));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── Worksheets (Klausuren; Inhalt via Chat, Ausfüllen in der App) ──
    server.tool(
      "list_worksheets",
      "Listet Arbeitsblätter (id, Titel, Thema/section, Status OPEN|IN_PROGRESS|COMPLETED, Score, Datum). " +
        "Vor create_worksheet prüfen, ob ein ähnliches Blatt schon existiert. " +
        "Filter optional nach targetLang und status.",
      {
        targetLang: z.string().optional(),
        status: z.nativeEnum(WorksheetStatus).optional(),
      },
      async (args) => {
        const api = await getCaller();
        return jsonResult(await api.worksheet.list(args));
      },
    );

    server.tool(
      "get_worksheet",
      "Lädt ein Arbeitsblatt inkl. aller Fragen, Lösungen (accepted) und gegebener Antworten. " +
        "Für Kontrolle, Weiterbearbeitung und als Kontext vor update_worksheet.",
      {
        id: z.string(),
      },
      async ({ id }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.worksheet.getById({ id }));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "get_worksheet_results",
      "Liefert die Nutzerantworten zu einem Arbeitsblatt inkl. automatischer Bewertung, " +
        "manueller Korrektur (richtig↔falsch via manualOverride) und einer Schwächen-Zusammenfassung " +
        "(byType, byTag, weakGrammarTopics, weakEntries). " +
        "Danach Grammatik-Kapitel/Vokabeln gezielt wiederholen.",
      {
        id: z.string(),
      },
      async ({ id }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.worksheet.getResults({ id }));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "create_worksheet",
      "Legt ein neues Arbeitsblatt an. WICHTIG: Vorher nachfragen " +
        "(„Soll ich das als Arbeitsblatt speichern?“). Zuerst Wissensstand laden " +
        "(list/search_grammar_topics, search_entries, get_stats, list_cards) und IDs verlinken " +
        "(grammarTopicId, entryId, tags). Status wird OPEN; der Nutzer füllt in der App aus. " +
        "Fragetypen: MULTIPLE_CHOICE (payload.options, accepted.optionId), " +
        "CLOZE (payload.text mit ___, accepted.blanks[].values), " +
        "FREE_TEXT (payload {}, accepted.values), " +
        "ERROR_CORRECTION (payload.sentence, accepted.values), " +
        "SENTENCE_REORDER (payload.tokens, accepted.order), " +
        "MATCHING (payload.left/right, accepted.pairs), " +
        "TRUE_FALSE (payload {}, accepted.isTrue; Begründung bewertet die App nicht), " +
        "CONJUGATION_GRID (payload.verb/tenseKey/persons, accepted.cells[].values). " +
        "maxScore typisch 20 (französische Notation).",
      {
        targetLang: z.string(),
        title: z.string(),
        description: z.string().optional(),
        section: z.string(),
        maxScore: z.number().int().optional(),
        questions: z.array(worksheetQuestionInputSchema).min(1).max(50),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.worksheet.create(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "update_worksheet",
      "Ergänzt oder korrigiert ein noch nicht abgeschlossenes Arbeitsblatt (nicht COMPLETED). " +
        "Metadaten optional. questions: ohne id = anhängen, mit id = bestehende unbeantwortete Frage ändern. " +
        "deleteQuestionIds nur für unbeantwortete Fragen. Vorher nachfragen.",
      {
        id: z.string(),
        targetLang: z.string().optional(),
        title: z.string().optional(),
        description: z.string().nullable().optional(),
        section: z.string().optional(),
        maxScore: z.number().int().nullable().optional(),
        questions: z.array(worksheetQuestionInputSchema).min(1).max(50).optional(),
        deleteQuestionIds: z.array(z.string()).max(50).optional(),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.worksheet.update(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "delete_worksheet",
      "Löscht ein Arbeitsblatt inkl. Fragen und Antworten. Vorher nachfragen.",
      {
        id: z.string(),
      },
      async ({ id }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.worksheet.delete({ id }));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── Daily ────────────────────────────────────────────────
    server.tool(
      "create_daily_package",
      "Erstellt ein DRAFT-Tagespaket aus neuen Sätzen, Vokabeln und Konjugationen (domain-stratifiziert). " +
        "Gibt eine Vorschau zurück und stößt fehlende Audio-Generierung an.",
      {
        targetLang: z.string(),
        satzCount: z.number().int().min(0).max(200),
        vocabCount: z.number().int().min(0).max(200),
        conjCount: z.number().int().min(0).max(200),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.daily.createPackage(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "list_daily_packages",
      "Listet Tagespakete einer Zielsprache (neueste zuerst, ohne ABANDONED).",
      {
        targetLang: z.string(),
        limit: z.number().int().min(1).max(90).optional(),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.daily.list(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "get_daily_package",
      "Lädt ein Tagespaket per id oder über targetLang + date (YYYY-MM-DD, default: heute).",
      {
        id: z.string().optional(),
        targetLang: z.string().optional(),
        date: z.string().optional(),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.daily.getPackage(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "activate_daily_package",
      "Setzt ein DRAFT-Paket auf ACTIVE, sobald alle Item-Audios fertig sind.",
      { id: z.string() },
      async ({ id }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.daily.activatePackage({ id }));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "start_daily_test",
      "Startet den Active-Recall-Test (ACTIVE → TESTING).",
      { id: z.string() },
      async ({ id }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.daily.startTest({ id }));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "submit_daily_test_answer",
      "Bewertet ein Daily-Item im TEST (richtig/falsch).",
      {
        itemId: z.string(),
        isCorrect: z.boolean(),
      },
      async (args) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.daily.submitTestAnswer(args));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "complete_daily_package",
      "Schließt den Test ab (TESTING → PRODUCTIVE) und legt Leitner-Progress auf Box 1 an.",
      { id: z.string() },
      async ({ id }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.daily.completePackage({ id }));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "abandon_daily_package",
      "Verwirft ein offenes Tagespaket manuell (ABANDONED). PRODUCTIVE-Pakete können nicht verworfen werden.",
      { id: z.string() },
      async ({ id }) => {
        const api = await getCaller();
        try {
          return jsonResult(await api.daily.abandonPackage({ id }));
        } catch (e) {
          return errorResult(e instanceof Error ? e.message : String(e));
        }
      },
    );

    server.tool(
      "get_daily_burndown",
      "Offener Neu-Bestand je Typ plus geschätzte Resttage anhand der letzten abgeschlossenen Tagespakete.",
      { targetLang: z.string() },
      async ({ targetLang }) => {
        const api = await getCaller();
        return jsonResult(await api.daily.burndown({ targetLang }));
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

import OpenAI from "openai";
import { env } from "~/env";
import { z } from "zod";
import { conjugationsSchema } from "~/lib/schemas/translation";
import {
  flattenConjugationsJson,
  getConjugationProfile,
  groupFormsByTense,
  isConjugatableLang,
  personLabels,
} from "~/lib/conjugation-catalog";
import { getLanguageName, SOURCE_LANG } from "~/lib/languages";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

const translationOutputSchema = z.record(
  z.string(),
  z.object({
    text: z.string(),
    example: z.string().optional(),
    regionTag: z.string().optional(),
    variants: z.array(z.string()).optional(),
    ipa: z.string().nullable().optional(),
    audioUrl: z.string().nullable().optional(),
    /** True if the verb is irregular in this target language */
    isIrregular: z.boolean().optional(),
    conjugations: conjugationsSchema,
  }),
);

function buildConjugationPromptNote(targetLangs: string[]): string {
  const langs = targetLangs.filter(isConjugatableLang);
  if (langs.length === 0) return "";

  const blocks = langs.map((lang) => {
    const profile = getConjugationProfile(lang)!;
    const personLine = profile.persons.map((p) => p.label).join(", ");
    const tenseLines = profile.tenses
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(
        (t) =>
          `- ${t.key}: ${t.label} — Array mit genau ${profile.persons.length} Formen in Reihenfolge [${personLine}]`,
      )
      .join("\n");

    return `Für ${lang.toUpperCase()} NUR diese Zeiten (keine anderen Keys):\n${tenseLines}`;
  });

  return `\n\nDies ist ein VERB. Für Sprachen mit Konjugationen (${langs.join(", ")}), füge "conjugations" hinzu.

WICHTIG: Generiere NUR die Katalog-Zeiten der jeweiligen Sprache. Keine zusätzlichen Zeiten.
WICHTIG: Jede Array-Form ist NUR die Verbform OHNE Subjektpronomen.
- Richtig: "see", "sees", "saw", "have seen", "will see" / "komme", "kommst", "bin gekommen"
- Falsch: "I see", "you see", "he/she/it sees", "ich komme", "yo veo"
Die Personen-Reihenfolge [${langs.map((l) => personLabels(l).join(", ")).join(" | ")}] gilt nur als Slot-Reihenfolge, nicht als Text in der Form.

${blocks.join("\n\n")}

Beispiel-Struktur (Keys müssen zum Katalog der Sprache passen):
"conjugations": {
  "present": ["…", "…", "…", "…", "…", "…"],
  …
}`;
}

/** Keep only catalog-valid tense/person slots after AI generation. */
function sanitizeConjugations(
  lang: string,
  conjugations: z.infer<typeof conjugationsSchema>,
) {
  if (!conjugations || !isConjugatableLang(lang)) return undefined;
  const flat = flattenConjugationsJson(lang, conjugations);
  if (flat.length === 0) return undefined;
  return groupFormsByTense(lang, flat);
}

export type TranslationResult = z.infer<typeof translationOutputSchema>;

const WORD_CATEGORIES = [
  "VERB",
  "NOUN",
  "ADJECTIVE",
  "PROVERB",
  "ADVERB",
  "PREPOSITION",
  "CONJUNCTION",
  "PRONOUN",
  "OTHER",
] as const;

const wordCategorySchema = z.enum(WORD_CATEGORIES);

const vocabSuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      text: z.string(),
      type: z.enum(["WORD", "PROVERB"]),
      category: wordCategorySchema,
      note: z.string().optional(),
    }),
  ),
});

export type VocabSuggestionResult = z.infer<typeof vocabSuggestionSchema>;

/** Keep type/category consistent after model output. */
function normalizeVocabSuggestions(
  result: VocabSuggestionResult,
): VocabSuggestionResult {
  return {
    suggestions: result.suggestions.map((s) => {
      if (s.type === "PROVERB" || s.category === "PROVERB") {
        return { ...s, type: "PROVERB" as const, category: "PROVERB" as const };
      }
      return s;
    }),
  };
}

export async function generateTranslations(params: {
  mainText: string;
  note?: string;
  targetLangs: string[];
  category?: string;
  sourceLang?: string;
}): Promise<TranslationResult> {
  const {
    mainText,
    note,
    targetLangs,
    category,
    sourceLang = SOURCE_LANG.code,
  } = params;

  const sourceName = getLanguageName(sourceLang);

  const languageDescriptions: Record<string, string> = {
    de: "Deutsch",
    en: "Englisch",
    es: "Spanisch",
    fr: "Französisch",
    pt: "Portugiesisch",
    gsw: "Schweizerdeutsch (mit regionTag und variants für verschiedene Schreibweisen)",
  };

  const langDescriptions = targetLangs
    .map((lang) => languageDescriptions[lang] ?? lang)
    .join(", ");

  const isVerb = category === "VERB";

  const contextNote = note ? `\n\nKontext/Hinweis: ${note}` : "";

  const conjugationNote = isVerb
    ? buildConjugationPromptNote(targetLangs)
    : "";

  const systemPrompt = `Du bist ein Übersetzungsassistent für Sprachlern-Flashcards. 
Gib nur valides JSON zurück, ohne zusätzliche Erklärungen oder Markdown-Formatierung.

Für jede Sprache gib zurück:
- text: Die Übersetzung
- ipa: IPA-Aussprache der Übersetzung (Pflicht), mit Slash-Notation, z.B. "/həˈloʊ/", "/kaˈsa/", "/paʁˈle/"
- example: Ein kurzer Beispielsatz (optional, aber empfohlen)
- Für Schweizerdeutsch (gsw):
  - regionTag: z.B. "BE" für Bern, "ZH" für Zürich (optional)
  - variants: Array mit alternativen Schreibweisen (optional)
  - ipa: phonetische Umschrift der gewählten Variante (auch bei gsw Pflicht)
${
  isVerb
    ? `- isIrregular: boolean — true NUR, wenn die Übersetzung in DIESER Zielsprache unregelmäßig/stark konjugiert
- conjugations: Objekt mit Konjugationen (siehe unten)

WICHTIG zu isIrregular (häufiger Fehler — vermeiden!):
- Beurteile JEDE Zielsprache UNABHÄNGIG anhand der übersetzten Verbform in genau dieser Sprache.
- Unregelmäßigkeit in der Quellsprache (${sourceName}) darf NICHT auf andere Sprachen übertragen werden.
- Beispiel: DE "raten" (unregelmäßig) → EN "guess" → isIrregular:false; ES "adivinar" → false; FR "deviner" → false; PT "adivinhar" → false.
- true nur bei wirklich unregelmäßigen Ziel-Verben (z.B. EN go/be/have, ES ser/ir/estar, FR être/avoir/aller).
- Regelmäßige Verben (EN regular -ed, ES/PT -ar/-er/-ir regulär, FR -er regulär): isIrregular:false.
- Im Zweifel: false — nicht pauschal alle Sprachen true setzen.`
    : ""
}

Format:
{
  "en": { "text": "...", "ipa": "/…/", "example": "..."${isVerb ? ', "isIrregular": false, "conjugations": {...}' : ""} },
  "es": { "text": "...", "ipa": "/…/", "example": "..."${isVerb ? ', "isIrregular": false, "conjugations": {...}' : ""} },
  ...
}`;

  const userPrompt = `Übersetze das folgende ${sourceName}-Wort/${isVerb ? "Verb" : "Sprichwort"} in: ${langDescriptions}

Original (${sourceName}): "${mainText}"${contextNote}${conjugationNote}
${
  isVerb
    ? `\nFür jede Zielsprache: setze isIrregular NUR für diese Sprache anhand der Übersetzung dort. Nicht von ${sourceName} ableiten. Nicht alle Sprachen gleich markieren.\n`
    : ""
}
Für jede Zielsprache: liefere zwingend "ipa" zur Übersetzung (IPA in Slash-Notation).
Gib nur das JSON-Objekt zurück.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content) as unknown;
    const validated = translationOutputSchema.parse(parsed);

    for (const lang of Object.keys(validated)) {
      const entry = validated[lang];
      if (!entry) continue;
      if (typeof entry.ipa === "string") {
        const trimmed = entry.ipa.trim();
        entry.ipa = trimmed.length > 0 ? trimmed : undefined;
      } else if (entry.ipa === null) {
        entry.ipa = undefined;
      }
      if (!isConjugatableLang(lang)) {
        delete entry.conjugations;
        continue;
      }
      entry.conjugations = sanitizeConjugations(lang, entry.conjugations);
    }

    return validated;
  } catch (error) {
    console.error("OpenAI translation error:", error);

    const fallback: TranslationResult = {};
    for (const lang of targetLangs) {
      fallback[lang] = {
        text: `[Translation failed for ${lang}]`,
        example: undefined,
      };
    }
    return fallback;
  }
}

const categorySuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      text: z.string(),
      note: z.string().optional(),
    }),
  ),
});

export type CategorySuggestionResult = z.infer<
  typeof categorySuggestionSchema
>;

export async function generateCategorySuggestions(params: {
  category: string;
  existingWords: string[];
  maxCount?: number;
  sourceLang?: string;
  /** When true and category is VERB: only suggest verbs irregular in irregularTargetLang */
  onlyIrregular?: boolean;
  /** Target language for irregularity (required when onlyIrregular) */
  irregularTargetLang?: string;
  /** Source lemmas already marked irregular in irregularTargetLang */
  existingIrregularWords?: string[];
}): Promise<CategorySuggestionResult> {
  const {
    category,
    existingWords,
    maxCount,
    sourceLang = SOURCE_LANG.code,
    onlyIrregular = false,
    irregularTargetLang,
    existingIrregularWords = [],
  } = params;

  const sourceName = getLanguageName(sourceLang);

  const categoryNames: Record<string, string> = {
    VERB: "Verben",
    NOUN: "Nomen",
    ADJECTIVE: "Adjektive",
    PROVERB: "Redewendungen",
    ADVERB: "Adverben",
    PREPOSITION: "Präpositionen",
    CONJUNCTION: "Konjunktionen",
    PRONOUN: "Pronomen",
  };

  const categoryName = categoryNames[category] ?? category;
  const irregularVerbMode =
    onlyIrregular && category === "VERB" && !!irregularTargetLang;
  const targetName = irregularTargetLang
    ? getLanguageName(irregularTargetLang)
    : "";

  const systemPrompt = `Du bist ein Experte für Sprachenlernen und Vokabelauswahl. 
Deine Aufgabe ist es, die wichtigsten und nützlichsten ${sourceName}-Wörter (${categoryName}) vorzuschlagen.

WICHTIG: Folgende ${categoryName} existieren bereits in der Datenbank (Quellform auf ${sourceName}) — NICHT erneut vorschlagen:
${existingWords.length > 0 ? existingWords.join(", ") : "(keine)"}
${
  irregularVerbMode
    ? `
WICHTIG: Diese Quell-Lemmata sind in ${targetName} bereits als unregelmäßig markiert — NICHT erneut vorschlagen:
${existingIrregularWords.length > 0 ? existingIrregularWords.join(", ") : "(keine)"}
`
    : ""
}
Regeln:
- Schlage NUR NEUE ${categoryName} auf ${sourceName} vor, die NICHT in der Liste der bestehenden Einträge sind
- Die Vorschläge müssen in ${sourceName} sein (Muttersprache/Quellsprache)
- "note" (falls gesetzt) muss ebenfalls auf ${sourceName} sein: kurzer Kontext/Disambiguierung in der Muttersprache — NIEMALS eine Übersetzung in eine andere Sprache (sonst wird die Lösung in der Abfrage verraten)
${
  irregularVerbMode
    ? `- NUR Verben, deren Entsprechung in ${targetName} (${irregularTargetLang}) unregelmäßig/stark konjugiert — nicht bezogen auf Unregelmäßigkeit in ${sourceName}
- Priorisiere die häufigsten und nützlichsten Verben mit unregelmäßiger ${targetName}-Konjugation`
    : `- Priorisiere nach:
  1. Häufigkeit im Alltag
  2. Nützlichkeit für Sprachlerner
  3. Wichtigkeit für Kommunikation`
}
- Qualität über Quantität - lieber weniger, aber relevante Vorschläge
${maxCount ? `- Maximum ${maxCount} Vorschläge, aber gerne weniger wenn sinnvoll` : "- Entscheide selbst, wie viele Vorschläge sinnvoll sind (typisch 15-30)"}

Gib nur valides JSON zurück im folgenden Format:
{
  "suggestions": [
    {
      "text": "${sourceName}-Wort oder Phrase",
      "note": "optionaler Kontext/Hinweis auf ${sourceName}"
    }
  ]
}`;

  const userPrompt = irregularVerbMode
    ? `Generiere wichtige ${sourceName}-Verben, die in ${targetName} unregelmäßig sind (für Sprachlerner).

Gib nur das JSON-Objekt zurück.`
    : `Generiere die wichtigsten ${sourceName}-Wörter (${categoryName}) für Sprachlerner.

Gib nur das JSON-Objekt zurück.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content) as unknown;
    const validated = categorySuggestionSchema.parse(parsed);

    return validated;
  } catch (error) {
    console.error("OpenAI category suggestion error:", error);

    return {
      suggestions: [],
    };
  }
}

export async function generateVocabSuggestions(params: {
  domainName: string;
  maxCount?: number;
  sourceLang?: string;
}): Promise<VocabSuggestionResult> {
  const {
    domainName,
    maxCount,
    sourceLang = SOURCE_LANG.code,
  } = params;

  const sourceName = getLanguageName(sourceLang);

  const categoryList = WORD_CATEGORIES.join(", ");

  const systemPrompt = `Du bist ein Experte für Sprachenlernen und Vokabelauswahl. 
Deine Aufgabe ist es, die wichtigsten und nützlichsten ${sourceName}-Wörter und Phrasen für einen bestimmten Lebensbereich/Domain vorzuschlagen.

Regeln:
- Die Vorschläge müssen in ${sourceName} sein (Muttersprache/Quellsprache)
- "note" (falls gesetzt) muss ebenfalls auf ${sourceName} sein: kurzer Kontext/Disambiguierung in der Muttersprache — NIEMALS eine Übersetzung in eine andere Sprache (sonst wird die Lösung in der Abfrage verraten)
- Jeder Vorschlag MUSS eine "category" haben. Erlaubte Werte (exakt so schreiben): ${categoryList}
- "type": "WORD" für Einzelwörter, "PROVERB" für Redewendungen/Phrasen
- Wenn type "PROVERB" ist, muss category ebenfalls "PROVERB" sein
- Wenn type "WORD" ist, wähle die passende Wortart (VERB, NOUN, ADJECTIVE, ADVERB, PREPOSITION, CONJUNCTION, PRONOUN oder OTHER) — nicht PROVERB
- Wähle die WICHTIGSTEN und HÄUFIGSTEN Wörter/Phrasen für diesen Bereich
- Mix aus einzelnen Wörtern und nützlichen Redewendungen/Phrasen
- Priorisiere praktische, alltagsrelevante Vokabeln
- Keine zu spezifischen oder seltenen Begriffe
- Qualität über Quantität - lieber weniger, aber relevante Vorschläge
${maxCount ? `- Maximum ${maxCount} Vorschläge, aber gerne weniger wenn sinnvoll` : "- Entscheide selbst, wie viele Vorschläge sinnvoll sind (typisch 15-30)"}

Gib nur valides JSON zurück im folgenden Format:
{
  "suggestions": [
    {
      "text": "${sourceName}-Wort oder Phrase",
      "type": "WORD" oder "PROVERB",
      "category": "eine von: ${categoryList}",
      "note": "optionaler Kontext/Hinweis auf ${sourceName}"
    }
  ]
}`;

  const userPrompt = `Generiere die wichtigsten Vokabeln auf ${sourceName} für den Bereich: "${domainName}"

Gib nur das JSON-Objekt zurück.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content) as unknown;
    const validated = vocabSuggestionSchema.parse(parsed);

    return normalizeVocabSuggestions(validated);
  } catch (error) {
    console.error("OpenAI vocab suggestion error:", error);

    return {
      suggestions: [],
    };
  }
}

const duplicateJudgeSchema = z.object({
  isDuplicate: z.boolean(),
  matchId: z.string().nullable(),
  reason: z.string().optional(),
});

export type DuplicateJudgeCandidate = {
  id: string;
  mainText: string;
  score: number;
};

export type DuplicateJudgeResult = z.infer<typeof duplicateJudgeSchema>;

const entryDuplicatePrompt = `Du prüfst, ob ein neuer Vokabeleintrag ein Duplikat eines bestehenden Eintrags ist.
Vergleiche nur den neuen Text mit den gelieferten Kandidaten. Es gibt keine weiteren Einträge.

Ein Duplikat ist: dasselbe Lemma, offensichtliches Synonym derselben Bedeutung, oder nur eine Umschreibung desselben Worts.
Kein Duplikat: verwandte aber verschiedene Wörter, andere Wortarten mit anderer Bedeutung, Ober-/Unterbegriffe.`;

const satzDuplicatePrompt = `Du prüfst, ob ein neuer Alltagssatz ein Duplikat eines bestehenden Satzes ist.
Vergleiche nur den neuen Text mit den gelieferten Kandidaten. Es gibt keine weiteren Sätze.

Ein Duplikat ist: dieselbe Aussage, eine Paraphrase, oder nur Unterschiede bei Höflichkeit/Interpunktion/Wortstellung.
Kein Duplikat: andere Situation, anderer Adressat, zusätzliche Information oder andere Absicht.`;

/** Small-context duplicate check: only the flagged neighbors, never the full corpus. */
export async function judgeSemanticDuplicates(params: {
  queryText: string;
  candidates: DuplicateJudgeCandidate[];
  kind?: "entry" | "satz";
}): Promise<DuplicateJudgeResult> {
  const { queryText, candidates, kind = "entry" } = params;
  const allowedIds = new Set(candidates.map((c) => c.id));

  const candidateLines = candidates
    .map(
      (c) =>
        `- id=${c.id} score=${c.score.toFixed(3)} text=${JSON.stringify(c.mainText)}`,
    )
    .join("\n");

  const systemPrompt = `${kind === "satz" ? satzDuplicatePrompt : entryDuplicatePrompt}

Gib nur JSON zurück:
{ "isDuplicate": boolean, "matchId": string | null, "reason": string }
matchId muss die id eines gelieferten Kandidaten sein, sonst null.`;

  const userPrompt = `Neuer Eintrag: ${JSON.stringify(queryText)}

Kandidaten:
${candidateLines}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No content in OpenAI duplicate-judge response");
  }

  const parsed = duplicateJudgeSchema.parse(JSON.parse(content) as unknown);
  if (parsed.matchId && !allowedIds.has(parsed.matchId)) {
    return { ...parsed, matchId: null };
  }
  return parsed;
}

const satzImportEnrichSchema = z.object({
  translations: z.record(z.string(), z.string()),
  register: z.enum(["INFORMAL", "FORMAL"]).optional(),
  priority: z.enum(["DAILY", "WEEKLY", "OCCASIONAL", "RARE"]).optional(),
  trigger: z.string().nullable().optional(),
  themeNames: z.array(z.string()).optional(),
  linkedEntryIds: z.array(z.string()).optional(),
  isAnswer: z.boolean().optional(),
  question: z.string().nullable().optional(),
  questionTranslations: z.record(z.string(), z.string()).optional(),
});

export type SatzImportEnrichResult = z.infer<typeof satzImportEnrichSchema>;

export type SatzImportVocabCandidate = {
  id: string;
  mainText: string;
  score: number;
};

/** One LLM call: translation + theme pick + vocab pick. Never send the full corpus. */
export async function enrichSatzImport(params: {
  germanText: string;
  targetLangs: string[];
  themeNames: string[];
  vocabCandidates: SatzImportVocabCandidate[];
}): Promise<SatzImportEnrichResult> {
  const allowedThemes = new Set(params.themeNames);
  const allowedEntryIds = new Set(params.vocabCandidates.map((c) => c.id));
  const allowedLangs = new Set(params.targetLangs);

  const langLines = params.targetLangs
    .map((code) => `- ${code}: ${getLanguageName(code)}`)
    .join("\n");
  const themeLines = params.themeNames.map((name) => `- ${name}`).join("\n");
  const vocabLines =
    params.vocabCandidates.length > 0
      ? params.vocabCandidates
          .map(
            (c) =>
              `- id=${c.id} score=${c.score.toFixed(3)} text=${JSON.stringify(c.mainText)}`,
          )
          .join("\n")
      : "(keine Kandidaten)";

  const systemPrompt = `Du reichst einen deutschen Alltagssatz für Language Islands an.
Arbeite nur mit der gelieferten Themenliste und den gelieferten Vokabel-Kandidaten. Es gibt keine weiteren Themen oder Wörter.

Regeln:
- Übersetze natürlich in jede genannte Zielsprache (Alltagssprache).
- register INFORMAL (du/tu) oder FORMAL (Sie/vous), passend zur Situation.
- priority: DAILY / WEEKLY / OCCASIONAL / RARE nach typischer Nutzung.
- trigger: kurze deutsche Szene, wann der Satz fällt, oder null.
- themeNames: 1–3 Namen exakt aus der Themenliste, sonst leer.
- linkedEntryIds: nur ids der gelieferten Vokabeln, die wirklich im Satz vorkommen.
- isAnswer: true, wenn der Satz typischerweise eine Antwort auf eine Alltagssfrage ist (nicht selbst die Frage).
- question: die natürliche deutsche Frage dazu, sonst null. Immer mit Fragezeichen.
- questionTranslations: Übersetzung dieser Frage in jede Zielsprache, nur wenn isAnswer.

Gib nur JSON zurück:
{
  "translations": { "<lang>": "<text>" },
  "register": "INFORMAL" | "FORMAL",
  "priority": "DAILY" | "WEEKLY" | "OCCASIONAL" | "RARE",
  "trigger": string | null,
  "themeNames": string[],
  "linkedEntryIds": string[],
  "isAnswer": boolean,
  "question": string | null,
  "questionTranslations": { "<lang>": "<text>" }
}`;

  const userPrompt = `Deutscher Satz: ${JSON.stringify(params.germanText)}

Zielsprachen:
${langLines}

Themen:
${themeLines}

Vokabel-Kandidaten:
${vocabLines}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No content in OpenAI satz-import response");
  }

  const parsed = satzImportEnrichSchema.parse(JSON.parse(content) as unknown);
  const translations = Object.fromEntries(
    Object.entries(parsed.translations)
      .filter(([lang, text]) => allowedLangs.has(lang) && text.trim().length > 0)
      .map(([lang, text]) => [lang, text.trim()]),
  );

  const questionTranslations = Object.fromEntries(
    Object.entries(parsed.questionTranslations ?? {})
      .filter(([lang, text]) => allowedLangs.has(lang) && text.trim().length > 0)
      .map(([lang, text]) => [lang, text.trim()]),
  );
  const question = parsed.question?.trim() || null;

  return {
    ...parsed,
    translations,
    themeNames: (parsed.themeNames ?? []).filter((name) => allowedThemes.has(name)),
    linkedEntryIds: (parsed.linkedEntryIds ?? []).filter((id) =>
      allowedEntryIds.has(id),
    ),
    isAnswer: parsed.isAnswer === true && Boolean(question),
    question,
    questionTranslations,
  };
}

const satzAnswerClassifySchema = z.object({
  isAnswer: z.boolean(),
  question: z.string().nullable(),
  questionTranslations: z.record(z.string(), z.string()).optional(),
});

export type SatzAnswerClassifyResult = z.infer<typeof satzAnswerClassifySchema>;

/** Small call for existing Sätze: is this an answer, and what is the question? */
export async function classifySatzAnswer(params: {
  germanText: string;
  targetLangs: string[];
}): Promise<SatzAnswerClassifyResult> {
  const allowedLangs = new Set(params.targetLangs);
  const langLines = params.targetLangs
    .map((code) => `- ${code}: ${getLanguageName(code)}`)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Du prüfst, ob ein deutscher Alltagssatz typischerweise eine Antwort auf eine Frage ist.
Ist der Satz selbst eine Frage oder eine eigenständige Aussage ohne typische Gegenfrage: isAnswer=false, question=null.
Sonst: natürliche deutsche Frage (mit Fragezeichen) und deren Übersetzungen.

Gib nur JSON zurück:
{ "isAnswer": boolean, "question": string | null, "questionTranslations": { "<lang>": "<text>" } }`,
      },
      {
        role: "user",
        content: `Satz: ${JSON.stringify(params.germanText)}\n\nZielsprachen:\n${langLines}`,
      },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No content in OpenAI satz-answer classify response");
  }

  const parsed = satzAnswerClassifySchema.parse(JSON.parse(content) as unknown);
  const question = parsed.question?.trim() || null;
  return {
    isAnswer: parsed.isAnswer === true && Boolean(question),
    question,
    questionTranslations: Object.fromEntries(
      Object.entries(parsed.questionTranslations ?? {})
        .filter(([lang, text]) => allowedLangs.has(lang) && text.trim().length > 0)
        .map(([lang, text]) => [lang, text.trim()]),
    ),
  };
}

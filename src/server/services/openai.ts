import OpenAI from "openai";
import { env } from "~/env";
import { z } from "zod";
import { conjugationsSchema } from "~/lib/schemas/translation";
import {
  flattenConjugationsJson,
  getConjugationProfile,
  groupFormsByTense,
  isConjugatableLang,
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

const vocabSuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      text: z.string(),
      type: z.enum(["WORD", "PROVERB"]),
      note: z.string().optional(),
    }),
  ),
});

export type VocabSuggestionResult = z.infer<typeof vocabSuggestionSchema>;

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
- example: Ein kurzer Beispielsatz (optional, aber empfohlen)
- Für Schweizerdeutsch (gsw):
  - regionTag: z.B. "BE" für Bern, "ZH" für Zürich (optional)
  - variants: Array mit alternativen Schreibweisen (optional)
${isVerb ? "- conjugations: Objekt mit Konjugationen (siehe unten)" : ""}

Format:
{
  "en": { "text": "...", "example": "..."${isVerb ? ', "conjugations": {...}' : ""} },
  "es": { "text": "...", "example": "..."${isVerb ? ', "conjugations": {...}' : ""} },
  ...
}`;

  const userPrompt = `Übersetze das folgende ${sourceName}-Wort/${isVerb ? "Verb" : "Sprichwort"} in: ${langDescriptions}

Original (${sourceName}): "${mainText}"${contextNote}${conjugationNote}

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
}): Promise<CategorySuggestionResult> {
  const {
    category,
    existingWords,
    maxCount,
    sourceLang = SOURCE_LANG.code,
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

  const systemPrompt = `Du bist ein Experte für Sprachenlernen und Vokabelauswahl. 
Deine Aufgabe ist es, die wichtigsten und nützlichsten ${sourceName}-Wörter (${categoryName}) vorzuschlagen.

WICHTIG: Folgende ${categoryName} existieren bereits in der Datenbank:
${existingWords.length > 0 ? existingWords.join(", ") : "(keine)"}

Regeln:
- Schlage NUR NEUE ${categoryName} auf ${sourceName} vor, die NICHT in der obigen Liste sind
- Die Vorschläge müssen in ${sourceName} sein (Muttersprache/Quellsprache)
- "note" (falls gesetzt) muss ebenfalls auf ${sourceName} sein: kurzer Kontext/Disambiguierung in der Muttersprache — NIEMALS eine Übersetzung in eine andere Sprache (sonst wird die Lösung in der Abfrage verraten)
- Priorisiere nach:
  1. Häufigkeit im Alltag
  2. Nützlichkeit für Sprachlerner
  3. Wichtigkeit für Kommunikation
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

  const userPrompt = `Generiere die wichtigsten ${sourceName}-Wörter (${categoryName}) für Sprachlerner.

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

  const systemPrompt = `Du bist ein Experte für Sprachenlernen und Vokabelauswahl. 
Deine Aufgabe ist es, die wichtigsten und nützlichsten ${sourceName}-Wörter und Phrasen für einen bestimmten Lebensbereich/Domain vorzuschlagen.

Regeln:
- Die Vorschläge müssen in ${sourceName} sein (Muttersprache/Quellsprache)
- "note" (falls gesetzt) muss ebenfalls auf ${sourceName} sein: kurzer Kontext/Disambiguierung in der Muttersprache — NIEMALS eine Übersetzung in eine andere Sprache (sonst wird die Lösung in der Abfrage verraten)
- Wähle die WICHTIGSTEN und HÄUFIGSTEN Wörter/Phrasen für diesen Bereich
- Mix aus einzelnen Wörtern (type: "WORD") und nützlichen Redewendungen/Phrasen (type: "PROVERB")
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

    return validated;
  } catch (error) {
    console.error("OpenAI vocab suggestion error:", error);

    return {
      suggestions: [],
    };
  }
}

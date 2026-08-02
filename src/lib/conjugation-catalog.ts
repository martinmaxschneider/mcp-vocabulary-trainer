export type ConjugationPerson = {
  index: number;
  label: string;
};

export type ConjugationTense = {
  key: string;
  label: string;
  sortOrder: number;
};

export type LanguageConjugationProfile = {
  lang: string;
  persons: ConjugationPerson[];
  tenses: ConjugationTense[];
};

const EN_PERSONS: ConjugationPerson[] = [
  { index: 0, label: "I" },
  { index: 1, label: "you" },
  { index: 2, label: "he/she/it" },
  { index: 3, label: "we" },
  { index: 4, label: "you (pl.)" },
  { index: 5, label: "they" },
];

const ES_PERSONS: ConjugationPerson[] = [
  { index: 0, label: "yo" },
  { index: 1, label: "tú" },
  { index: 2, label: "él/ella" },
  { index: 3, label: "nosotros" },
  { index: 4, label: "vosotros" },
  { index: 5, label: "ellos/ellas" },
];

const FR_PERSONS: ConjugationPerson[] = [
  { index: 0, label: "je" },
  { index: 1, label: "tu" },
  { index: 2, label: "il/elle" },
  { index: 3, label: "nous" },
  { index: 4, label: "vous" },
  { index: 5, label: "ils/elles" },
];

/** Languages that support verb conjugation paradigms in this app. */
export const CONJUGATABLE_LANGS = ["en", "es", "fr"] as const;
export type ConjugatableLang = (typeof CONJUGATABLE_LANGS)[number];

export const CONJUGATION_CATALOG: Record<
  ConjugatableLang,
  LanguageConjugationProfile
> = {
  en: {
    lang: "en",
    persons: EN_PERSONS,
    tenses: [
      { key: "present", label: "Present", sortOrder: 1 },
      { key: "past", label: "Simple Past", sortOrder: 2 },
      { key: "perfect", label: "Present Perfect", sortOrder: 3 },
      { key: "future", label: "Future (will)", sortOrder: 4 },
      { key: "conditional", label: "Conditional (would)", sortOrder: 5 },
    ],
  },
  es: {
    lang: "es",
    persons: ES_PERSONS,
    tenses: [
      { key: "present", label: "Presente", sortOrder: 1 },
      { key: "past", label: "Pretérito Indefinido", sortOrder: 2 },
      { key: "perfect", label: "Pretérito Perfecto", sortOrder: 3 },
      { key: "imperfect", label: "Pretérito Imperfecto", sortOrder: 4 },
      { key: "future", label: "Futuro Simple", sortOrder: 5 },
      { key: "conditional", label: "Condicional", sortOrder: 6 },
    ],
  },
  fr: {
    lang: "fr",
    persons: FR_PERSONS,
    tenses: [
      { key: "present", label: "Présent", sortOrder: 1 },
      { key: "past", label: "Passé Composé", sortOrder: 2 },
      { key: "imperfect", label: "Imparfait", sortOrder: 3 },
      { key: "future", label: "Futur Simple", sortOrder: 4 },
      { key: "conditional", label: "Conditionnel", sortOrder: 5 },
      { key: "pluperfect", label: "Plus-que-parfait", sortOrder: 6 },
    ],
  },
};

export function isConjugatableLang(lang: string): lang is ConjugatableLang {
  return (CONJUGATABLE_LANGS as readonly string[]).includes(lang);
}

export function getConjugationProfile(
  lang: string
): LanguageConjugationProfile | null {
  if (!isConjugatableLang(lang)) return null;
  return CONJUGATION_CATALOG[lang];
}

export function getAllConjugationProfiles(): LanguageConjugationProfile[] {
  return CONJUGATABLE_LANGS.map((lang) => CONJUGATION_CATALOG[lang]);
}

export function isValidTense(lang: string, tenseKey: string): boolean {
  const profile = getConjugationProfile(lang);
  if (!profile) return false;
  return profile.tenses.some((t) => t.key === tenseKey);
}

export function isValidPersonIndex(lang: string, personIndex: number): boolean {
  const profile = getConjugationProfile(lang);
  if (!profile) return false;
  return personIndex >= 0 && personIndex < profile.persons.length;
}

export function personLabels(lang: string): string[] {
  return getConjugationProfile(lang)?.persons.map((p) => p.label) ?? [];
}

export function tenseLabel(lang: string, tenseKey: string): string {
  const tense = getConjugationProfile(lang)?.tenses.find(
    (t) => t.key === tenseKey
  );
  return tense?.label ?? tenseKey;
}

/** Flatten a legacy conjugations JSON object into form rows (catalog-valid only). */
export function flattenConjugationsJson(
  lang: string,
  conjugations: Record<string, unknown> | null | undefined
): Array<{ tenseKey: string; personIndex: number; form: string }> {
  const profile = getConjugationProfile(lang);
  if (!profile || !conjugations || typeof conjugations !== "object") return [];

  const rows: Array<{ tenseKey: string; personIndex: number; form: string }> =
    [];

  for (const tense of profile.tenses) {
    const forms = conjugations[tense.key];
    if (!Array.isArray(forms)) continue;
    forms.forEach((form, personIndex) => {
      if (
        typeof form === "string" &&
        form.trim() &&
        isValidPersonIndex(lang, personIndex)
      ) {
        rows.push({ tenseKey: tense.key, personIndex, form: form.trim() });
      }
    });
  }

  return rows;
}

/** Group form rows back into tense -> string[] for display helpers. */
export function groupFormsByTense(
  lang: string,
  forms: Array<{ tenseKey: string; personIndex: number; form: string }>
): Record<string, string[]> {
  const profile = getConjugationProfile(lang);
  if (!profile) return {};

  const result: Record<string, string[]> = {};
  for (const tense of profile.tenses) {
    const arr = Array.from({ length: profile.persons.length }, () => "");
    let hasAny = false;
    for (const f of forms) {
      if (f.tenseKey !== tense.key) continue;
      if (f.personIndex >= 0 && f.personIndex < arr.length) {
        arr[f.personIndex] = f.form;
        hasAny = true;
      }
    }
    if (hasAny) result[tense.key] = arr;
  }
  return result;
}

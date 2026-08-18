import {
  SatzPriority,
  SatzRegister,
  SatzSource,
} from "@prisma/client";
import { isTargetLang, TARGET_LANG_CODES } from "~/lib/languages";
import { normalizeSatzText } from "~/lib/satz-csv";

export type DraftTranslation = {
  lang: string;
  text: string;
  register: SatzRegister;
};

export type DraftCandidate = {
  id: string;
  mainText: string;
  score: number;
  llmMatch?: boolean;
};

const REGISTER_VALUES = new Set<string>(Object.values(SatzRegister));
const PRIORITY_VALUES = new Set<string>(Object.values(SatzPriority));
const SOURCE_VALUES = new Set<string>(Object.values(SatzSource));

export function parseStringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter((item): item is string => typeof item === "string" && item.length > 0),
    ),
  ];
}

export function parseDraftTranslations(value: unknown): DraftTranslation[] {
  if (!Array.isArray(value)) return [];
  const out: DraftTranslation[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.lang !== "string" || typeof rec.text !== "string") continue;
    if (!isTargetLang(rec.lang)) continue;
    const text = rec.text.trim();
    if (!text) continue;
    const register =
      typeof rec.register === "string" && REGISTER_VALUES.has(rec.register)
        ? (rec.register as SatzRegister)
        : SatzRegister.INFORMAL;
    out.push({ lang: rec.lang, text, register });
  }
  return out;
}

export function parseDraftCandidates(value: unknown): DraftCandidate[] {
  if (!Array.isArray(value)) return [];
  const out: DraftCandidate[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== "string" || typeof rec.mainText !== "string") continue;
    const score = typeof rec.score === "number" ? rec.score : 0;
    out.push({
      id: rec.id,
      mainText: rec.mainText,
      score,
      llmMatch: rec.llmMatch === true,
    });
  }
  return out;
}

export function resolveThemeNames(
  suggested: string[],
  themes: Array<{ id: string; name: string }>,
): string[] {
  const byNorm = new Map(
    themes.map((theme) => [normalizeSatzText(theme.name), theme.id]),
  );
  const ids: string[] = [];
  for (const name of suggested) {
    const id = byNorm.get(normalizeSatzText(name));
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function isDraftReadyToCommit(draft: {
  status: string;
  skip: boolean;
  isDuplicate: boolean;
  allowSimilar: boolean;
  translations: unknown;
}): boolean {
  if (draft.skip) return false;
  if (draft.status === "COMMITTED") return false;
  if (draft.status !== "ENRICHED" && draft.status !== "SKIPPED_DUPLICATE") {
    return false;
  }
  if (draft.isDuplicate && !draft.allowSimilar) return false;
  return parseDraftTranslations(draft.translations).length > 0;
}

export function parsePriority(value: unknown, fallback = SatzPriority.OCCASIONAL) {
  return typeof value === "string" && PRIORITY_VALUES.has(value)
    ? (value as SatzPriority)
    : fallback;
}

export function parseRegister(value: unknown, fallback = SatzRegister.INFORMAL) {
  return typeof value === "string" && REGISTER_VALUES.has(value)
    ? (value as SatzRegister)
    : fallback;
}

export function parseSource(value: unknown, fallback = SatzSource.GENERIC) {
  return typeof value === "string" && SOURCE_VALUES.has(value)
    ? (value as SatzSource)
    : fallback;
}

export function activeTargetLangSet(): Set<string> {
  return new Set(TARGET_LANG_CODES);
}

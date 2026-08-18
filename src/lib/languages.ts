export const LEARNING_LANG_CODES = [
  "de",
  "en",
  "es",
  "fr",
  "pt",
  "gsw",
] as const;

export type LearningLangCode = (typeof LEARNING_LANG_CODES)[number];

export type LangMeta = {
  code: LearningLangCode;
  name: string;
  flag: string;
};

export const LEARNING_LANGS: readonly LangMeta[] = [
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "en", name: "Englisch", flag: "🇬🇧" },
  { code: "es", name: "Spanisch", flag: "🇪🇸" },
  { code: "fr", name: "Französisch", flag: "🇫🇷" },
  { code: "pt", name: "Portugiesisch", flag: "🇵🇹" },
  { code: "gsw", name: "Schweizerdeutsch", flag: "🇨🇭" },
] as const;

export const LANGUAGE_NAMES: Record<string, string> = Object.fromEntries(
  LEARNING_LANGS.map((l) => [l.code, l.name]),
);

function resolveNativeLang(): LearningLangCode {
  const raw = process.env.NEXT_PUBLIC_NATIVE_LANG ?? "de";
  if ((LEARNING_LANG_CODES as readonly string[]).includes(raw)) {
    return raw as LearningLangCode;
  }
  return "de";
}

function resolveTargetLangs(sourceCode: LearningLangCode): LangMeta[] {
  const allTargets = LEARNING_LANGS.filter((l) => l.code !== sourceCode);
  const raw = process.env.NEXT_PUBLIC_TARGET_LANGS?.trim();
  if (!raw) {
    return [...allTargets];
  }

  const wanted = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  return allTargets.filter((l) => wanted.has(l.code));
}

const nativeCode = resolveNativeLang();

export const SOURCE_LANG: LangMeta =
  LEARNING_LANGS.find((l) => l.code === nativeCode) ?? LEARNING_LANGS[0]!;

/** Active target languages (all except native, or subset from NEXT_PUBLIC_TARGET_LANGS). */
export const TARGET_LANGS: LangMeta[] = resolveTargetLangs(SOURCE_LANG.code);

export type TargetLangCode = LearningLangCode;

export const TARGET_LANG_CODES = TARGET_LANGS.map((l) => l.code);

/** Native language first, then learning targets — used for TTS profiles. */
export const TTS_LANGS: LangMeta[] = [SOURCE_LANG, ...TARGET_LANGS];

export function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

export function getLearningLang(code: string): LangMeta | undefined {
  return LEARNING_LANGS.find((l) => l.code === code);
}

export function getTargetLang(code: string): LangMeta | undefined {
  return TARGET_LANGS.find((l) => l.code === code);
}

export function isLearningLang(code: string): code is LearningLangCode {
  return (LEARNING_LANG_CODES as readonly string[]).includes(code);
}

export function isTargetLang(code: string): boolean {
  return TARGET_LANG_CODES.includes(code as LearningLangCode);
}

export function resolveImportTargetLang(code?: string | null): LearningLangCode {
  if (code && isTargetLang(code)) return code as LearningLangCode;
  return TARGET_LANGS[0]?.code ?? "en";
}

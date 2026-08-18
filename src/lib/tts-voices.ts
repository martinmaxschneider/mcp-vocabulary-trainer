export function normalizeTtsLang(lang: string): string {
  return lang === "gsw" ? "de" : lang;
}

const KOKORO_PREFIXES: Record<string, string[]> = {
  en: ["am_", "af_", "bm_", "bf_"],
  fr: ["ff_", "fm_"],
  es: ["ef_", "em_"],
  pt: ["pf_", "pm_"],
  de: ["df_", "dm_"],
};

export function voiceMatchesLang(voice: string, lang: string): boolean {
  const code = normalizeTtsLang(lang).toLowerCase();
  const value = voice.toLowerCase();

  if (value.startsWith(`${code}-`) || value.startsWith(`${code}_`)) return true;
  if (value.includes(`-${code}-`) || value.includes(`_${code}_`)) return true;
  if (value.endsWith(`-${code}`) || value.endsWith(`_${code}`)) return true;
  if (value.includes(`:${code}`) || value.endsWith(`.${code}`)) return true;

  const prefixes = KOKORO_PREFIXES[code] ?? [];
  return prefixes.some((prefix) => value.startsWith(prefix));
}

export function voicesForLang(voices: string[], lang: string): string[] {
  const matched = voices.filter((voice) => voiceMatchesLang(voice, lang));
  return matched.length > 0 ? matched : [...voices];
}

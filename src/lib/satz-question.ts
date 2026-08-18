const QUESTION_STARTERS =
  /^(wer|was|wo|wohin|woher|wann|wie|warum|wieso|weshalb|welche[rsn]?|womit|woran|wobei|weswegen|wieso)\b/i;

export function looksLikeQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.endsWith("?")) return true;
  return QUESTION_STARTERS.test(trimmed);
}

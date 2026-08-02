/**
 * Map tRPC / server error messages to stable i18n keys under errors.codes.*.
 */
const EXACT_MESSAGE_TO_CODE: Record<string, string> = {
  "Entry not found": "ENTRY_NOT_FOUND",
  "Domain not found": "DOMAIN_NOT_FOUND",
  "Domain already exists": "DOMAIN_EXISTS",
  "Not found": "NOT_FOUND",
  "Progress not found": "PROGRESS_NOT_FOUND",
  "Translation not found": "TRANSLATION_NOT_FOUND",
  "No valid tenses selected": "NO_VALID_TENSES",
  "Conjugation form not found": "CONJUGATION_FORM_NOT_FOUND",
};

export function resolveErrorCode(message: string | undefined): string | null {
  if (!message) return null;

  const exact = EXACT_MESSAGE_TO_CODE[message];
  if (exact) return exact;

  if (/^Domain with name ".+" already exists$/.test(message)) {
    return "DOMAIN_EXISTS";
  }
  if (message.startsWith("No conjugation catalog for language:")) {
    return "NO_CONJUGATION_CATALOG";
  }

  return null;
}

/**
 * Map tRPC / server error messages to stable i18n keys under errors.codes.*.
 */
const EXACT_MESSAGE_TO_CODE: Record<string, string> = {
  "Entry not found": "ENTRY_NOT_FOUND",
  "Satz not found": "SATZ_NOT_FOUND",
  "Domain not found": "DOMAIN_NOT_FOUND",
  "Domain already exists": "DOMAIN_EXISTS",
  "Not found": "NOT_FOUND",
  "Progress not found": "PROGRESS_NOT_FOUND",
  "Translation not found": "TRANSLATION_NOT_FOUND",
  "No valid tenses selected": "NO_VALID_TENSES",
  "Conjugation form not found": "CONJUGATION_FORM_NOT_FOUND",
  "Updates are disabled in development": "UPDATE_DISABLED_IN_DEV",
  "An update is already running": "UPDATE_ALREADY_RUNNING",
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

  if (message.startsWith("Worksheet ") && message.includes("not found")) {
    return "WORKSHEET_NOT_FOUND";
  }
  if (message.includes("already answered")) {
    return "QUESTION_ALREADY_ANSWERED";
  }
  if (message.startsWith("Cannot update a completed worksheet")) {
    return "WORKSHEET_COMPLETED";
  }

  return null;
}

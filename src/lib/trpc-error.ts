/**
 * Map tRPC / server error messages to stable i18n keys under errors.codes.*.
 */
const EXACT_MESSAGE_TO_CODE: Record<string, string> = {
  "Entry not found": "ENTRY_NOT_FOUND",
  "Satz not found": "SATZ_NOT_FOUND",
  "answerToId does not match an existing Satz": "SATZ_ANSWER_NOT_FOUND",
  "Satz import batch not found": "SATZ_IMPORT_NOT_FOUND",
  "Satz import draft not found": "SATZ_IMPORT_DRAFT_NOT_FOUND",
  "Satz import batch already committed": "SATZ_IMPORT_ALREADY_COMMITTED",
  "Satz import draft already committed": "SATZ_IMPORT_ALREADY_COMMITTED",
  CSV_EMPTY: "CSV_EMPTY",
  CSV_TOO_LARGE: "CSV_TOO_LARGE",
  CSV_TOO_MANY_ROWS: "CSV_TOO_MANY_ROWS",
  SATZ_IMPORT_NOTHING_TO_COMMIT: "SATZ_IMPORT_NOTHING_TO_COMMIT",
  "Domain not found": "DOMAIN_NOT_FOUND",
  "Domain already exists": "DOMAIN_EXISTS",
  "Not found": "NOT_FOUND",
  "Progress not found": "PROGRESS_NOT_FOUND",
  "Translation not found": "TRANSLATION_NOT_FOUND",
  "No valid tenses selected": "NO_VALID_TENSES",
  "Conjugation form not found": "CONJUGATION_FORM_NOT_FOUND",
  "Updates are disabled in development": "UPDATE_DISABLED_IN_DEV",
  "An update is already running": "UPDATE_ALREADY_RUNNING",
  "OpenRouter API key is not configured": "OPENROUTER_NOT_CONFIGURED",
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
  if (message.startsWith("OpenRouter ")) {
    return "OPENROUTER_UNAVAILABLE";
  }

  return null;
}

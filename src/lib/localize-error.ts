import { resolveErrorCode } from "~/lib/trpc-error";

type TranslateFn = (key: string) => string;

/**
 * Resolve a tRPC error.message to a localized string via errors.codes.*.
 */
export function localizeTrpcError(
  message: string | undefined,
  tCodes: TranslateFn,
): string {
  if (!message) return "";
  const code = resolveErrorCode(message);
  return code ? tCodes(code) : message;
}

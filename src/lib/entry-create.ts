export function isEntryCreated<T extends { created: boolean }>(
  result: T,
): result is T & { created: true } {
  return result.created;
}

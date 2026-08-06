export type PronunciationSymbol = {
  id: string;
  symbol: string;
};

export type IpaSegment = {
  text: string;
  itemId?: string;
};

/** Strip surrounding slashes and trim IPA for matching. */
export function normalizeIpa(ipa: string): string {
  return ipa.trim().replace(/^\/+|\/+$/g, "").trim();
}

/**
 * Greedy longest-match of guide symbols against an IPA string.
 * Unknown characters (and whitespace) stay as non-clickable plain text.
 */
export function segmentIpa(
  ipa: string,
  items: PronunciationSymbol[],
): IpaSegment[] {
  const text = normalizeIpa(ipa);
  if (!text) return [];

  const sorted = [...items]
    .filter((i) => i.symbol.trim().length > 0)
    .map((i) => ({ id: i.id, symbol: i.symbol.trim() }))
    .sort((a, b) => b.symbol.length - a.symbol.length);

  const symbolToId = new Map<string, string>();
  for (const item of sorted) {
    if (!symbolToId.has(item.symbol)) {
      symbolToId.set(item.symbol, item.id);
    }
  }
  const symbols = [...symbolToId.keys()].sort((a, b) => b.length - a.length);

  const segments: IpaSegment[] = [];
  let i = 0;

  while (i < text.length) {
    let matched = false;
    for (const symbol of symbols) {
      if (text.startsWith(symbol, i)) {
        segments.push({ text: symbol, itemId: symbolToId.get(symbol) });
        i += symbol.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const ch = text[i]!;
    const last = segments[segments.length - 1];
    if (last && !last.itemId) {
      last.text += ch;
    } else {
      segments.push({ text: ch });
    }
    i += 1;
  }

  return segments;
}

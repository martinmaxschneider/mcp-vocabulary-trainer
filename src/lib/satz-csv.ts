import {
  parseMediaKind,
  parseMediaYear,
  type MediaKindName,
} from "~/lib/media-work";

export const SATZ_CSV_MAX_ROWS = 400;
export const SATZ_CSV_MAX_CHARS = 200_000;

export type ParsedSatzCsvMedia = {
  mediaKind: MediaKindName;
  mediaTitle: string;
  mediaCreator?: string;
  mediaUrl?: string;
  mediaYear?: number;
};

export type ParsedSatzCsvRow = {
  rowNumber: number;
  mainText: string;
  translation: string;
} & Partial<ParsedSatzCsvMedia>;

export type ParseSatzCsvResult = {
  rows: ParsedSatzCsvRow[];
  skippedEmpty: number;
  hasHeader: boolean;
};

type ColumnRole =
  | "main"
  | "translation"
  | "mediaKind"
  | "mediaTitle"
  | "mediaCreator"
  | "mediaUrl"
  | "mediaYear";

const MAIN_HEADERS = new Set([
  "deutsch",
  "de",
  "german",
  "satz",
  "maintext",
  "main",
  "source",
  "text",
]);

const TRANSLATION_HEADERS = new Set([
  "ubersetzung",
  "uebersetzung",
  "translation",
  "en",
  "fr",
  "es",
  "pt",
  "englisch",
  "english",
  "franzosisch",
  "french",
  "spanisch",
  "spanish",
  "portugiesisch",
  "portuguese",
]);

const MEDIA_KIND_HEADERS = new Set(["mediakind", "kind", "typ", "type"]);
const MEDIA_TITLE_HEADERS = new Set(["mediatitle", "title", "titel", "werk"]);
const MEDIA_CREATOR_HEADERS = new Set([
  "mediacreator",
  "creator",
  "artist",
  "autor",
  "author",
  "kanal",
  "channel",
  "regie",
]);
const MEDIA_URL_HEADERS = new Set(["mediaurl", "url", "link"]);
const MEDIA_YEAR_HEADERS = new Set(["mediayear", "year", "jahr"]);

export function normalizeSatzText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function detectCsvDelimiter(sample: string): "," | ";" {
  let commas = 0;
  let semis = 0;
  let inQuotes = false;
  for (const ch of sample) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === ",") commas += 1;
    if (ch === ";") semis += 1;
  }
  return semis > commas ? ";" : ",";
}

export function parseCsvLine(line: string, delimiter: "," | ";"): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

function normalizeHeader(cell: string): string {
  return cell
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[\s_-]+/g, "");
}

export function looksLikeSatzCsvHeader(cells: string[]): boolean {
  if (cells.length < 2) return false;
  const norms = cells.map(normalizeHeader).filter(Boolean);
  const hasMain = norms.some((n) => MAIN_HEADERS.has(n));
  const hasMedia = norms.some(
    (n) => MEDIA_KIND_HEADERS.has(n) || MEDIA_TITLE_HEADERS.has(n),
  );
  if (hasMain) return true;
  return hasMedia && cells.length >= 3;
}

function roleForHeader(norm: string): ColumnRole | undefined {
  if (MAIN_HEADERS.has(norm)) return "main";
  if (TRANSLATION_HEADERS.has(norm)) return "translation";
  if (MEDIA_KIND_HEADERS.has(norm)) return "mediaKind";
  if (MEDIA_TITLE_HEADERS.has(norm)) return "mediaTitle";
  if (MEDIA_CREATOR_HEADERS.has(norm)) return "mediaCreator";
  if (MEDIA_URL_HEADERS.has(norm)) return "mediaUrl";
  if (MEDIA_YEAR_HEADERS.has(norm)) return "mediaYear";
  return undefined;
}

function resolveColumnMap(headerCells: string[]): Partial<Record<ColumnRole, number>> {
  const map: Partial<Record<ColumnRole, number>> = {};
  headerCells.forEach((cell, index) => {
    const role = roleForHeader(normalizeHeader(cell));
    if (role && map[role] === undefined) {
      map[role] = index;
    }
  });
  if (map.main === undefined) map.main = 0;
  if (map.translation === undefined) {
    const fallback = map.main === 1 ? 0 : 1;
    if (
      headerCells.length > fallback &&
      map.mediaKind !== fallback &&
      map.mediaTitle !== fallback
    ) {
      map.translation = fallback;
    }
  }
  return map;
}

function cellAt(cells: string[], index: number | undefined): string {
  if (index === undefined) return "";
  return (cells[index] ?? "").trim();
}

function mediaFromCells(
  cells: string[],
  columns: Partial<Record<ColumnRole, number>>,
): Partial<ParsedSatzCsvMedia> {
  const title = cellAt(cells, columns.mediaTitle);
  const kind = parseMediaKind(cellAt(cells, columns.mediaKind));
  if (!title || !kind) return {};
  const creator = cellAt(cells, columns.mediaCreator);
  const url = cellAt(cells, columns.mediaUrl);
  const year = parseMediaYear(cellAt(cells, columns.mediaYear));
  return {
    mediaKind: kind,
    mediaTitle: title,
    ...(creator ? { mediaCreator: creator } : {}),
    ...(url ? { mediaUrl: url } : {}),
    ...(year ? { mediaYear: year } : {}),
  };
}

export function parseSatzCsv(input: string): ParseSatzCsvResult {
  const text = input.replace(/^\uFEFF/, "");
  if (text.length > SATZ_CSV_MAX_CHARS) {
    throw new Error("CSV_TOO_LARGE");
  }

  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], skippedEmpty: 0, hasHeader: false };
  }

  const delimiter = detectCsvDelimiter(lines[0]!);
  const firstCells = parseCsvLine(lines[0]!, delimiter);
  if (firstCells.length < 2) {
    throw new Error("CSV_MISSING_TRANSLATION");
  }

  const hasHeader = looksLikeSatzCsvHeader(firstCells);
  const columns: Partial<Record<ColumnRole, number>> = hasHeader
    ? resolveColumnMap(firstCells)
    : { main: 0, translation: 1 };
  const dataLines = hasHeader ? lines.slice(1) : lines;
  if (columns.translation === undefined) {
    throw new Error("CSV_MISSING_TRANSLATION");
  }

  const rows: ParsedSatzCsvRow[] = [];
  let skippedEmpty = 0;
  const lineOffset = hasHeader ? 2 : 1;

  for (const line of dataLines) {
    const cells = parseCsvLine(line, delimiter);
    const mainText = cellAt(cells, columns.main);
    const translation = cellAt(cells, columns.translation);
    if (!mainText || !translation) {
      skippedEmpty += 1;
      continue;
    }
    const media = hasHeader ? mediaFromCells(cells, columns) : {};
    rows.push({
      rowNumber: rows.length + skippedEmpty + lineOffset,
      mainText,
      translation,
      ...media,
    });
    if (rows.length > SATZ_CSV_MAX_ROWS) {
      throw new Error("CSV_TOO_MANY_ROWS");
    }
  }

  return { rows, skippedEmpty, hasHeader };
}

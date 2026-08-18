export const SATZ_CSV_MAX_ROWS = 400;
export const SATZ_CSV_MAX_CHARS = 200_000;

export type ParsedSatzCsvRow = {
  rowNumber: number;
  mainText: string;
};

export type ParseSatzCsvResult = {
  rows: ParsedSatzCsvRow[];
  skippedEmpty: number;
};

const NUMBER_HEADERS = new Set([
  "nummer",
  "nr",
  "no",
  "number",
  "n",
  "#",
  "id",
  "zeile",
  "row",
]);

const SATZ_HEADERS = new Set([
  "deutscher satz",
  "deutscher_satz",
  "satz",
  "sentence",
  "deutsch",
  "text",
  "haupttext",
  "maintext",
  "main_text",
  "phrase",
  "frase",
]);

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

function headerKey(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function looksLikeHeader(cells: string[]): boolean {
  return cells.some((cell) => {
    const key = headerKey(cell);
    return NUMBER_HEADERS.has(key) || SATZ_HEADERS.has(key);
  });
}

function columnIndexes(header: string[]): { numberIdx: number; textIdx: number } {
  let numberIdx = -1;
  let textIdx = -1;
  header.forEach((cell, idx) => {
    const key = headerKey(cell);
    if (numberIdx < 0 && NUMBER_HEADERS.has(key)) numberIdx = idx;
    if (textIdx < 0 && SATZ_HEADERS.has(key)) textIdx = idx;
  });
  if (textIdx < 0) {
    textIdx = header.length > 1 ? 1 : 0;
  }
  if (numberIdx < 0 && textIdx !== 0) numberIdx = 0;
  return { numberIdx, textIdx };
}

function parseRowNumber(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const match = raw.match(/\d+/);
  if (!match) return fallback;
  const value = Number.parseInt(match[0]!, 10);
  return Number.isFinite(value) ? value : fallback;
}

export function parseSatzCsv(input: string): ParseSatzCsvResult {
  const text = input.replace(/^\uFEFF/, "");
  if (text.length > SATZ_CSV_MAX_CHARS) {
    throw new Error("CSV_TOO_LARGE");
  }

  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], skippedEmpty: 0 };
  }

  const delimiter = detectCsvDelimiter(lines[0]!);
  const firstCells = parseCsvLine(lines[0]!, delimiter);
  const hasHeader = looksLikeHeader(firstCells);
  const { numberIdx, textIdx } = hasHeader
    ? columnIndexes(firstCells)
    : {
        numberIdx: firstCells.length > 1 ? 0 : -1,
        textIdx: firstCells.length > 1 ? 1 : 0,
      };

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows: ParsedSatzCsvRow[] = [];
  let skippedEmpty = 0;

  for (const line of dataLines) {
    const cells = parseCsvLine(line, delimiter);
    const mainText = (cells[textIdx] ?? "").trim();
    if (!mainText) {
      skippedEmpty += 1;
      continue;
    }
    const fallbackNumber = rows.length + skippedEmpty + 1;
    const rowNumber =
      numberIdx >= 0
        ? parseRowNumber(cells[numberIdx], fallbackNumber)
        : fallbackNumber;
    rows.push({ rowNumber, mainText });
    if (rows.length > SATZ_CSV_MAX_ROWS) {
      throw new Error("CSV_TOO_MANY_ROWS");
    }
  }

  return { rows, skippedEmpty };
}

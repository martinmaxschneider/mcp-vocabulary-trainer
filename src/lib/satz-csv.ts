export const SATZ_CSV_MAX_ROWS = 400;
export const SATZ_CSV_MAX_CHARS = 200_000;

export type ParsedSatzCsvRow = {
  rowNumber: number;
  mainText: string;
  translation: string;
};

export type ParseSatzCsvResult = {
  rows: ParsedSatzCsvRow[];
  skippedEmpty: number;
};

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
  if (firstCells.length < 2) {
    throw new Error("CSV_MISSING_TRANSLATION");
  }

  const rows: ParsedSatzCsvRow[] = [];
  let skippedEmpty = 0;

  for (const line of lines) {
    const cells = parseCsvLine(line, delimiter);
    const mainText = (cells[0] ?? "").trim();
    const translation = (cells[1] ?? "").trim();
    if (!mainText || !translation) {
      skippedEmpty += 1;
      continue;
    }
    rows.push({
      rowNumber: rows.length + skippedEmpty + 1,
      mainText,
      translation,
    });
    if (rows.length > SATZ_CSV_MAX_ROWS) {
      throw new Error("CSV_TOO_MANY_ROWS");
    }
  }

  return { rows, skippedEmpty };
}

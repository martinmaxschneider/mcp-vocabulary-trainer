import { describe, expect, it } from "vitest";
import {
  detectCsvDelimiter,
  normalizeSatzText,
  parseCsvLine,
  parseSatzCsv,
} from "~/lib/satz-csv";
import {
  isDraftReadyToCommit,
  parseDraftTranslations,
  resolveThemeNames,
} from "~/lib/satz-import";

describe("satz csv", () => {
  it("detects semicolon delimiters from German Excel headers", () => {
    expect(detectCsvDelimiter("Nummer;deutscher Satz")).toBe(";");
    expect(detectCsvDelimiter("Nummer,deutscher Satz")).toBe(",");
  });

  it("parses quoted fields with the delimiter inside", () => {
    expect(parseCsvLine('1;"Hallo, wie geht\'s?"', ";")).toEqual([
      "1",
      "Hallo, wie geht's?",
    ]);
  });

  it("reads Nummer + deutscher Satz columns", () => {
    const csv = `Nummer;deutscher Satz
12;Können Sie das wiederholen?
13;Wo ist der Bahnhof?
`;
    const result = parseSatzCsv(csv);
    expect(result.skippedEmpty).toBe(0);
    expect(result.rows).toEqual([
      { rowNumber: 12, mainText: "Können Sie das wiederholen?" },
      { rowNumber: 13, mainText: "Wo ist der Bahnhof?" },
    ]);
  });

  it("accepts a single-column list without header", () => {
    const result = parseSatzCsv("Guten Morgen\n\nWie spät ist es?");
    expect(result.skippedEmpty).toBe(0);
    expect(result.rows.map((r) => r.mainText)).toEqual([
      "Guten Morgen",
      "Wie spät ist es?",
    ]);
  });

  it("strips a BOM and skips empty sentence cells", () => {
    const result = parseSatzCsv("\uFEFFNummer;deutscher Satz\n1;\n2;Hallo");
    expect(result.skippedEmpty).toBe(1);
    expect(result.rows).toEqual([{ rowNumber: 2, mainText: "Hallo" }]);
  });

  it("normalizes whitespace for duplicate comparison", () => {
    expect(normalizeSatzText("  Hallo   Welt  ")).toBe("hallo welt");
  });
});

describe("satz import helpers", () => {
  it("maps suggested theme names onto catalog ids", () => {
    const ids = resolveThemeNames(
      ["familie", "Unbekannt", "Essen & Trinken / Restaurant"],
      [
        { id: "a", name: "Familie" },
        { id: "b", name: "Essen & Trinken / Restaurant" },
      ],
    );
    expect(ids).toEqual(["a", "b"]);
  });

  it("requires a translation and an explicit similar override for duplicates", () => {
    expect(
      isDraftReadyToCommit({
        status: "ENRICHED",
        skip: false,
        isDuplicate: false,
        allowSimilar: false,
        translations: [{ lang: "fr", text: "Bonjour", register: "INFORMAL" }],
      }),
    ).toBe(true);

    expect(
      isDraftReadyToCommit({
        status: "SKIPPED_DUPLICATE",
        skip: false,
        isDuplicate: true,
        allowSimilar: false,
        translations: [{ lang: "fr", text: "Bonjour", register: "INFORMAL" }],
      }),
    ).toBe(false);

    expect(
      isDraftReadyToCommit({
        status: "SKIPPED_DUPLICATE",
        skip: false,
        isDuplicate: true,
        allowSimilar: true,
        translations: [{ lang: "fr", text: "Bonjour", register: "INFORMAL" }],
      }),
    ).toBe(true);
  });

  it("keeps target-language drafts and drops unknown lang codes", () => {
    expect(
      parseDraftTranslations([
        { lang: "fr", text: "Bonjour", register: "INFORMAL" },
        { lang: "it", text: "Ciao", register: "INFORMAL" },
        { lang: "de", text: "Hallo", register: "INFORMAL" },
      ]),
    ).toEqual([{ lang: "fr", text: "Bonjour", register: "INFORMAL" }]);
  });
});

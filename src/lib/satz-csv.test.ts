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
  translationsForLang,
} from "~/lib/satz-import";

describe("satz csv", () => {
  it("detects semicolon delimiters from the first data row", () => {
    expect(detectCsvDelimiter("Können Sie das wiederholen?;Can you repeat that?")).toBe(
      ";",
    );
    expect(detectCsvDelimiter("Können Sie das wiederholen?,Can you repeat that?")).toBe(
      ",",
    );
  });

  it("parses quoted fields with the delimiter inside", () => {
    expect(parseCsvLine('"Hallo, wie geht\'s?";"Hi, how are you?"', ";")).toEqual([
      "Hallo, wie geht's?",
      "Hi, how are you?",
    ]);
  });

  it("treats the first row as a sentence, never as a header", () => {
    const csv = `Können Sie das wiederholen?;Can you repeat that?
Wo ist der Bahnhof?;Where is the station?
`;
    const result = parseSatzCsv(csv);
    expect(result.skippedEmpty).toBe(0);
    expect(result.hasHeader).toBe(false);
    expect(result.rows).toEqual([
      {
        rowNumber: 1,
        mainText: "Können Sie das wiederholen?",
        translation: "Can you repeat that?",
      },
      {
        rowNumber: 2,
        mainText: "Wo ist der Bahnhof?",
        translation: "Where is the station?",
      },
    ]);
  });

  it("accepts a two-column list without header", () => {
    const result = parseSatzCsv(
      "Guten Morgen,Good morning\nWie spät ist es?,What time is it?",
    );
    expect(result.skippedEmpty).toBe(0);
    expect(result.hasHeader).toBe(false);
    expect(result.rows).toEqual([
      { rowNumber: 1, mainText: "Guten Morgen", translation: "Good morning" },
      {
        rowNumber: 2,
        mainText: "Wie spät ist es?",
        translation: "What time is it?",
      },
    ]);
  });

  it("rejects a file without a translation column", () => {
    expect(() => parseSatzCsv("Guten Morgen\nWie spät ist es?")).toThrow(
      "CSV_MISSING_TRANSLATION",
    );
  });

  it("strips a BOM and skips rows missing a sentence or translation", () => {
    const result = parseSatzCsv("\uFEFFHallo,Hello\n,Hello\nHallo,\nTschüss,Bye");
    expect(result.skippedEmpty).toBe(2);
    expect(result.hasHeader).toBe(false);
    expect(result.rows).toEqual([
      { rowNumber: 1, mainText: "Hallo", translation: "Hello" },
      { rowNumber: 4, mainText: "Tschüss", translation: "Bye" },
    ]);
  });

  it("parses optional media columns when a header row is present", () => {
    const csv = `deutsch;französisch;mediaKind;mediaTitle;mediaCreator;mediaUrl
Quand il me prend dans ses bras;When he takes me in his arms;SONG;La Vie en Rose;Édith Piaf;
Wo kommst du her?;Where are you from?;VIDEO;Super Easy German 1;Easy German;https://www.youtube.com/watch?v=abc123
Hallo.;Hello.;
`;
    const result = parseSatzCsv(csv);
    expect(result.hasHeader).toBe(true);
    expect(result.rows).toEqual([
      {
        rowNumber: 2,
        mainText: "Quand il me prend dans ses bras",
        translation: "When he takes me in his arms",
        mediaKind: "SONG",
        mediaTitle: "La Vie en Rose",
        mediaCreator: "Édith Piaf",
      },
      {
        rowNumber: 3,
        mainText: "Wo kommst du her?",
        translation: "Where are you from?",
        mediaKind: "VIDEO",
        mediaTitle: "Super Easy German 1",
        mediaCreator: "Easy German",
        mediaUrl: "https://www.youtube.com/watch?v=abc123",
      },
      {
        rowNumber: 4,
        mainText: "Hallo.",
        translation: "Hello.",
      },
    ]);
  });

  it("does not treat a two-column sentence starting with Kind as a header", () => {
    const result = parseSatzCsv("Kind,Child");
    expect(result.hasHeader).toBe(false);
    expect(result.rows).toEqual([
      { rowNumber: 1, mainText: "Kind", translation: "Child" },
    ]);
  });

  it("ignores extra columns when there is no header", () => {
    const result = parseSatzCsv(
      "Guten Morgen,Good morning,SONG,La Vie en Rose",
    );
    expect(result.hasHeader).toBe(false);
    expect(result.rows).toEqual([
      { rowNumber: 1, mainText: "Guten Morgen", translation: "Good morning" },
    ]);
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
    expect(
      translationsForLang(
        [
          { lang: "fr", text: "Bonjour", register: "INFORMAL" },
          { lang: "es", text: "Hola", register: "INFORMAL" },
        ],
        "fr",
      ),
    ).toEqual([{ lang: "fr", text: "Bonjour", register: "INFORMAL" }]);
  });
});

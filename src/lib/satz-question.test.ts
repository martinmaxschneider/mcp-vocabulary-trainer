import { describe, expect, it } from "vitest";
import { looksLikeQuestion } from "~/lib/satz-question";

describe("looksLikeQuestion", () => {
  it("treats a trailing question mark as a question", () => {
    expect(looksLikeQuestion("Können Sie das wiederholen?")).toBe(true);
    expect(looksLikeQuestion("Wo ist der Bahnhof?")).toBe(true);
  });

  it("treats German question words without a mark as questions", () => {
    expect(looksLikeQuestion("Was kostet das")).toBe(true);
    expect(looksLikeQuestion("Wohin geht dieser Zug")).toBe(true);
  });

  it("does not treat typical answers as questions", () => {
    expect(looksLikeQuestion("Einen Kaffee, bitte.")).toBe(false);
    expect(looksLikeQuestion("Ja, gerne")).toBe(false);
    expect(looksLikeQuestion("Ich hätte gern den Tisch am Fenster.")).toBe(
      false,
    );
  });
});

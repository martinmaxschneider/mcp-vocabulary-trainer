import { describe, expect, it } from "vitest";
import {
  CONJUGATABLE_LANGS,
  conjugationAnswerTargets,
  flattenConjugationsJson,
  getConjugationProfile,
  groupFormsByTense,
  isConjugatableLang,
  isValidPersonIndex,
  isValidTense,
  personLabels,
  stripPersonPronoun,
  tenseLabel,
} from "./conjugation-catalog";

describe("conjugation-catalog", () => {
  it("exposes de/en/es/fr/pt profiles with 6 persons", () => {
    for (const lang of CONJUGATABLE_LANGS) {
      const profile = getConjugationProfile(lang);
      expect(profile).not.toBeNull();
      expect(profile!.persons).toHaveLength(6);
      expect(profile!.tenses.length).toBeGreaterThan(0);
    }
  });

  it("does not treat gsw as conjugatable", () => {
    expect(isConjugatableLang("gsw")).toBe(false);
    expect(isConjugatableLang("pt")).toBe(true);
    expect(getConjugationProfile("gsw")).toBeNull();
  });

  it("validates language-specific tenses", () => {
    expect(isValidTense("de", "present")).toBe(true);
    expect(isValidTense("de", "past")).toBe(true);
    expect(isValidTense("de", "conditional")).toBe(true);
    expect(isValidTense("de", "imperfect")).toBe(false);
    expect(isValidTense("en", "present")).toBe(true);
    expect(isValidTense("en", "imperfect")).toBe(false);
    expect(isValidTense("es", "imperfect")).toBe(true);
    expect(isValidTense("pt", "imperfect")).toBe(true);
    expect(isValidTense("fr", "pluperfect")).toBe(true);
    expect(isValidTense("fr", "perfect")).toBe(false);
  });

  it("validates person indices", () => {
    expect(isValidPersonIndex("es", 0)).toBe(true);
    expect(isValidPersonIndex("es", 5)).toBe(true);
    expect(isValidPersonIndex("es", 6)).toBe(false);
  });

  it("returns person and tense labels", () => {
    expect(personLabels("de")[0]).toBe("ich");
    expect(tenseLabel("de", "perfect")).toBe("Perfekt");
    expect(personLabels("es")[0]).toBe("yo");
    expect(tenseLabel("fr", "imperfect")).toBe("Imparfait");
    expect(tenseLabel("en", "unknown")).toBe("unknown");
  });

  it("strips leading person pronouns from forms", () => {
    expect(stripPersonPronoun("en", "I see")).toBe("see");
    expect(stripPersonPronoun("en", "he/she/it sees")).toBe("sees");
    expect(stripPersonPronoun("en", "will see")).toBe("will see");
    expect(stripPersonPronoun("de", "ich komme")).toBe("komme");
    expect(stripPersonPronoun("es", "vería")).toBe("vería");
  });

  it("prefers verb-only answers for drills", () => {
    expect(conjugationAnswerTargets("en", "I see")).toEqual({
      expected: "see",
      variants: ["I see"],
    });
    expect(conjugationAnswerTargets("en", "have seen")).toEqual({
      expected: "have seen",
      variants: [],
    });
  });

  it("flattens and groups conjugations JSON for catalog tenses only", () => {
    const flat = flattenConjugationsJson("es", {
      present: ["a", "b", "c", "d", "e", "f"],
      imperfect: ["ia", "ias", "ia", "iamos", "iais", "ian"],
      // not in Spanish catalog under this name as a separate slot beyond profile
      nonsense: ["x"],
    });
    expect(flat).toHaveLength(12);
    expect(flat.some((r) => r.tenseKey === "nonsense")).toBe(false);

    const grouped = groupFormsByTense("es", flat);
    expect(grouped.present?.[0]).toBe("a");
    expect(grouped.imperfect?.[1]).toBe("ias");
  });
});

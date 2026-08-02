import { describe, expect, it } from "vitest";
import {
  CONJUGATABLE_LANGS,
  flattenConjugationsJson,
  getConjugationProfile,
  groupFormsByTense,
  isConjugatableLang,
  isValidPersonIndex,
  isValidTense,
  personLabels,
  tenseLabel,
} from "./conjugation-catalog";

describe("conjugation-catalog", () => {
  it("exposes en/es/fr profiles with 6 persons", () => {
    for (const lang of CONJUGATABLE_LANGS) {
      const profile = getConjugationProfile(lang);
      expect(profile).not.toBeNull();
      expect(profile!.persons).toHaveLength(6);
      expect(profile!.tenses.length).toBeGreaterThan(0);
    }
  });

  it("does not treat gsw as conjugatable", () => {
    expect(isConjugatableLang("gsw")).toBe(false);
    expect(getConjugationProfile("gsw")).toBeNull();
  });

  it("validates language-specific tenses", () => {
    expect(isValidTense("en", "present")).toBe(true);
    expect(isValidTense("en", "imperfect")).toBe(false);
    expect(isValidTense("es", "imperfect")).toBe(true);
    expect(isValidTense("fr", "pluperfect")).toBe(true);
    expect(isValidTense("fr", "perfect")).toBe(false);
  });

  it("validates person indices", () => {
    expect(isValidPersonIndex("es", 0)).toBe(true);
    expect(isValidPersonIndex("es", 5)).toBe(true);
    expect(isValidPersonIndex("es", 6)).toBe(false);
  });

  it("returns person and tense labels", () => {
    expect(personLabels("es")[0]).toBe("yo");
    expect(tenseLabel("fr", "imperfect")).toBe("Imparfait");
    expect(tenseLabel("en", "unknown")).toBe("unknown");
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

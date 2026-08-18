import { describe, expect, it } from "vitest";
import {
  CANONICAL_DOMAINS,
  EXISTING_THEME_DOMAIN_NAMES,
  GRAMMAR_DOMAIN_NAMES,
  NEW_THEME_DOMAIN_NAMES,
  SPECIAL_DOMAIN_NAMES,
  THEME_DOMAIN_NAMES,
  groupDomainsByKind,
  kindForDomainName,
} from "~/lib/domain-catalog";

describe("domain catalog", () => {
  it("has 18 theme domains (5 existing + 13 new)", () => {
    expect(EXISTING_THEME_DOMAIN_NAMES).toHaveLength(5);
    expect(NEW_THEME_DOMAIN_NAMES).toHaveLength(13);
    expect(THEME_DOMAIN_NAMES).toHaveLength(18);
  });

  it("classifies known live domains", () => {
    expect(kindForDomainName("Begrüßungen")).toBe("THEME");
    expect(kindForDomainName("Redewendungen")).toBe("SPECIAL");
    expect(kindForDomainName("Modalverben")).toBe("GRAMMAR");
    expect(kindForDomainName("Unknown")).toBeUndefined();
  });

  it("lists every canonical name once", () => {
    const names = CANONICAL_DOMAINS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(
      THEME_DOMAIN_NAMES.length +
        SPECIAL_DOMAIN_NAMES.length +
        GRAMMAR_DOMAIN_NAMES.length,
    );
  });

  it("groups and sorts domains by kind", () => {
    const groups = groupDomainsByKind([
      { id: "1", name: "Wohnen & Zuhause", kind: "THEME" as const },
      { id: "2", name: "Modalverben", kind: "GRAMMAR" as const },
      { id: "3", name: "Begrüßungen", kind: "THEME" as const },
      { id: "4", name: "Redewendungen", kind: "SPECIAL" as const },
    ]);

    expect(groups.map((g) => g.kind)).toEqual(["THEME", "SPECIAL", "GRAMMAR"]);
    expect(groups[0]!.domains.map((d) => d.name)).toEqual([
      "Begrüßungen",
      "Wohnen & Zuhause",
    ]);
  });
});

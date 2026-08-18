export const DOMAIN_KINDS = ["THEME", "GRAMMAR", "SPECIAL"] as const;

export type DomainKindName = (typeof DOMAIN_KINDS)[number];

export const DOMAIN_KIND_ORDER: readonly DomainKindName[] = [
  "THEME",
  "SPECIAL",
  "GRAMMAR",
];

/** Existing theme domains that stay in the catalog. */
export const EXISTING_THEME_DOMAIN_NAMES = [
  "Begrüßungen",
  "Selbstvorstellung",
  "Familie",
  "Wohnen & Zuhause",
  "Rettungsanker",
] as const;

/** New theme domains from the Sätze briefing (Phase 1). */
export const NEW_THEME_DOMAIN_NAMES = [
  "Alltag & Tagesablauf",
  "Essen & Trinken / Restaurant",
  "Einkaufen & Kleidung",
  "Gesundheit & Arzt",
  "Reisen & Verkehrsmittel",
  "Wegbeschreibung & Orientierung",
  "Arbeit & Beruf",
  "Freizeit & Hobbys",
  "Medien & Kommunikation",
  "Wetter & Jahreszeiten",
  "Ämter & Dienstleistungen",
  "Meinungen & Diskutieren",
  "Gefühle & Befinden ausdrücken",
] as const;

export const THEME_DOMAIN_NAMES = [
  ...EXISTING_THEME_DOMAIN_NAMES,
  ...NEW_THEME_DOMAIN_NAMES,
] as const;

export const SPECIAL_DOMAIN_NAMES = ["Redewendungen"] as const;

export const GRAMMAR_DOMAIN_NAMES = [
  "Adjektive mit Bedeutungsverschiebung",
  "Alltagsnomen",
  "Fragewörter",
  "Genus bei l'-Wörtern",
  "Kernverben",
  "Modalverben",
  "Verneinung",
] as const;

export type CanonicalDomain = {
  name: string;
  kind: DomainKindName;
};

export const CANONICAL_DOMAINS: readonly CanonicalDomain[] = [
  ...THEME_DOMAIN_NAMES.map((name) => ({ name, kind: "THEME" as const })),
  ...SPECIAL_DOMAIN_NAMES.map((name) => ({ name, kind: "SPECIAL" as const })),
  ...GRAMMAR_DOMAIN_NAMES.map((name) => ({ name, kind: "GRAMMAR" as const })),
];

const KIND_BY_NAME = new Map<string, DomainKindName>(
  CANONICAL_DOMAINS.map((d) => [d.name, d.kind]),
);

export function kindForDomainName(name: string): DomainKindName | undefined {
  return KIND_BY_NAME.get(name);
}

export function groupDomainsByKind<T extends { kind: DomainKindName; name: string }>(
  domains: T[],
): Array<{ kind: DomainKindName; domains: T[] }> {
  return DOMAIN_KIND_ORDER.map((kind) => ({
    kind,
    domains: domains
      .filter((domain) => domain.kind === kind)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "de")),
  })).filter((group) => group.domains.length > 0);
}

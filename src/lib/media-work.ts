export const MEDIA_KINDS = [
  "SONG",
  "FILM",
  "SERIES",
  "VIDEO",
  "BOOK",
  "PODCAST",
  "OTHER",
] as const;

export type MediaKindName = (typeof MEDIA_KINDS)[number];

const KIND_SET = new Set<string>(MEDIA_KINDS);

const KIND_ALIASES: Record<string, MediaKindName> = {
  song: "SONG",
  lied: "SONG",
  chanson: "SONG",
  cancion: "SONG",
  film: "FILM",
  movie: "FILM",
  pelicula: "FILM",
  serie: "SERIES",
  series: "SERIES",
  video: "VIDEO",
  youtube: "VIDEO",
  book: "BOOK",
  buch: "BOOK",
  livre: "BOOK",
  libro: "BOOK",
  podcast: "PODCAST",
  other: "OTHER",
  sonstiges: "OTHER",
  autre: "OTHER",
  otro: "OTHER",
};

export function isMediaKind(value: string): value is MediaKindName {
  return KIND_SET.has(value);
}

export function normalizeMediaTitleKey(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export function parseMediaKind(value: string | undefined | null): MediaKindName | undefined {
  if (!value) return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  if (isMediaKind(upper)) return upper;
  const alias = KIND_ALIASES[raw.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")];
  return alias;
}

export function parseMediaYear(value: string | undefined | null): number | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^\d{4}$/);
  if (!match) return undefined;
  const year = Number(match[0]);
  if (year < 1000 || year > 2100) return undefined;
  return year;
}

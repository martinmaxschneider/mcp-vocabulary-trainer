export const SATZ_LISTEN_SETTINGS_KEY = "sprachen.satzListenSettings";

export type SatzListenSettings = {
  pauseMs: number;
  playbackRate: number;
  repeatsPerSentence: number;
  listRepeats: number;
  autoAdvance: boolean;
  mainLangOnce: boolean;
  settingsOpen: boolean;
};

export const DEFAULT_SATZ_LISTEN_SETTINGS: SatzListenSettings = {
  pauseMs: 1200,
  playbackRate: 1,
  repeatsPerSentence: 1,
  listRepeats: 1,
  autoAdvance: true,
  mainLangOnce: true,
  settingsOpen: false,
};

export const SATZ_LISTEN_PAUSE_RANGE = { min: 0, max: 3000, step: 100 } as const;
export const SATZ_LISTEN_RATE_RANGE = { min: 0.5, max: 1.5, step: 0.05 } as const;
export const SATZ_LISTEN_RATE_OPTIONS = [0.75, 1, 1.25] as const;
const REPEAT_OPTIONS = [1, 3, 5] as const;
const LIST_REPEAT_OPTIONS = [1, 2, 3] as const;

export const SATZ_LISTEN_REPEAT_OPTIONS = REPEAT_OPTIONS;
export const SATZ_LISTEN_LIST_REPEAT_OPTIONS = LIST_REPEAT_OPTIONS;

function asAllowedNumber(
  value: unknown,
  fallback: number,
  allowed: readonly number[],
) {
  return typeof value === "number" && allowed.includes(value) ? value : fallback;
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  step: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(max, Math.max(min, value));
  const steps = Math.round((clamped - min) / step);
  return Number((min + steps * step).toFixed(2));
}

export function parseSatzListenSettings(raw: unknown): SatzListenSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_SATZ_LISTEN_SETTINGS;
  const value = raw as Partial<SatzListenSettings>;
  return {
    pauseMs: clampNumber(
      value.pauseMs,
      DEFAULT_SATZ_LISTEN_SETTINGS.pauseMs,
      SATZ_LISTEN_PAUSE_RANGE.min,
      SATZ_LISTEN_PAUSE_RANGE.max,
      SATZ_LISTEN_PAUSE_RANGE.step,
    ),
    playbackRate: clampNumber(
      value.playbackRate,
      DEFAULT_SATZ_LISTEN_SETTINGS.playbackRate,
      SATZ_LISTEN_RATE_RANGE.min,
      SATZ_LISTEN_RATE_RANGE.max,
      SATZ_LISTEN_RATE_RANGE.step,
    ),
    repeatsPerSentence: asAllowedNumber(
      value.repeatsPerSentence,
      DEFAULT_SATZ_LISTEN_SETTINGS.repeatsPerSentence,
      REPEAT_OPTIONS,
    ),
    listRepeats: asAllowedNumber(
      value.listRepeats,
      DEFAULT_SATZ_LISTEN_SETTINGS.listRepeats,
      LIST_REPEAT_OPTIONS,
    ),
    autoAdvance:
      typeof value.autoAdvance === "boolean"
        ? value.autoAdvance
        : DEFAULT_SATZ_LISTEN_SETTINGS.autoAdvance,
    mainLangOnce:
      typeof value.mainLangOnce === "boolean"
        ? value.mainLangOnce
        : DEFAULT_SATZ_LISTEN_SETTINGS.mainLangOnce,
    settingsOpen:
      typeof value.settingsOpen === "boolean"
        ? value.settingsOpen
        : DEFAULT_SATZ_LISTEN_SETTINGS.settingsOpen,
  };
}

export function loadSatzListenSettings(): SatzListenSettings {
  if (typeof window === "undefined") return DEFAULT_SATZ_LISTEN_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SATZ_LISTEN_SETTINGS_KEY);
    return parseSatzListenSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_SATZ_LISTEN_SETTINGS;
  }
}

export function saveSatzListenSettings(settings: SatzListenSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SATZ_LISTEN_SETTINGS_KEY, JSON.stringify(settings));
}

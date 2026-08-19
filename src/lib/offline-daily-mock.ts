import type { DailyListenSource } from "~/lib/daily-listen";
import type { OfflineDailyRecord } from "~/lib/offline-daily";

/** Short silent MP3 so the player treats demo clips as playable. */
const SILENT_MP3 =
  "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV////////////////////////////////////////////AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQDkAAAAAAAAAGw9wrNaQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+MYxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxDsAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";

function clip(kind: "main" | "translation", durationMs: number) {
  return { url: SILENT_MP3, durationMs, kind };
}

export const MOCK_OFFLINE_ITEMS: DailyListenSource[] = [
  {
    id: "mock-satz-1",
    itemType: "SATZ",
    targetText: "¿Dónde está la estación?",
    nativeText: "Wo ist der Bahnhof?",
    tenseLabel: null,
    domain: { id: "travel", name: "Reisen" },
    questionText: "Pregunta a alguien en la calle.",
    questionTranslation: "Frag jemanden auf der Straße.",
    clips: [clip("main", 2100), clip("translation", 1600)],
    audioStatus: "READY",
  },
  {
    id: "mock-entry-1",
    itemType: "ENTRY",
    targetText: "el andén",
    nativeText: "der Bahnsteig",
    tenseLabel: null,
    domain: { id: "travel", name: "Reisen" },
    clips: [clip("main", 1400), clip("translation", 1200)],
    audioStatus: "READY",
  },
  {
    id: "mock-satz-2",
    itemType: "SATZ",
    targetText: "El tren sale a las ocho.",
    nativeText: "Der Zug fährt um acht ab.",
    tenseLabel: null,
    domain: { id: "travel", name: "Reisen" },
    clips: [clip("main", 2400), clip("translation", 1800)],
    audioStatus: "READY",
  },
  {
    id: "mock-conj-1",
    itemType: "CONJUGATION",
    targetText: "salir",
    nativeText: "gehen, verlassen",
    tenseLabel: "Presente",
    domain: { id: "verbs", name: "Verben" },
    clips: [clip("main", 1900), clip("translation", 1500)],
    audioStatus: "READY",
  },
  {
    id: "mock-entry-2",
    itemType: "ENTRY",
    targetText: "tarde",
    nativeText: "spät",
    tenseLabel: null,
    domain: { id: "time", name: "Zeit" },
    clips: [clip("main", 1100), clip("translation", 900)],
    audioStatus: "READY",
  },
];

export const MOCK_OFFLINE_RECORD: OfflineDailyRecord = {
  id: "current",
  packageId: "mock-daily",
  date: "2026-08-19",
  targetLang: "es",
  savedAt: "2026-08-19T12:00:00.000Z",
  items: MOCK_OFFLINE_ITEMS,
};

import type { DailyPackageStatus } from "@prisma/client";
import type { PlaybackClip } from "~/lib/satz-tts";

export type MobileDailyClip = {
  url: string;
  durationMs: number | null;
  kind: PlaybackClip["kind"];
};

export type MobileDailyItem = {
  id: string;
  itemType: string;
  targetText: string;
  nativeText: string;
  tenseLabel: string | null;
  domain: { id: string; name: string } | null;
  questionText: string | null;
  questionTranslation: string | null;
  audioStatus: string;
  clips: MobileDailyClip[];
};

export type MobileDailyPackage = {
  id: string;
  date: string;
  targetLang: string;
  status: string;
  audioReady: boolean;
  audioDone: number;
  audioTotal: number;
  downloadable: boolean;
  items: MobileDailyItem[];
};

export type MobileHydratedItem = {
  id: string;
  itemType: string;
  targetText: string;
  nativeText: string;
  tenseLabel: string | null;
  domain: { id: string; name: string } | null;
  questionText: string | null;
  questionTranslation: string | null;
  audioStatus: string;
  clips: PlaybackClip[];
};

export type MobileHydratedPackage = {
  id: string;
  date: string;
  targetLang: string;
  status: DailyPackageStatus | string;
  audioReady: boolean;
  audioDone: number;
  audioTotal: number;
  items: MobileHydratedItem[];
};

export function isMobilePackDownloadable(pkg: {
  status: string;
  items: Array<{ clips: Array<{ url: string }> }>;
}): boolean {
  return (
    (pkg.status === "ACTIVE" || pkg.status === "TESTING") &&
    pkg.items.some((item) => item.clips.length > 0)
  );
}

export function toMobileDailyPackage(
  pkg: MobileHydratedPackage,
): MobileDailyPackage {
  const items = pkg.items.map((item) => ({
    id: item.id,
    itemType: item.itemType,
    targetText: item.targetText,
    nativeText: item.nativeText,
    tenseLabel: item.tenseLabel,
    domain: item.domain,
    questionText: item.questionText,
    questionTranslation: item.questionTranslation,
    audioStatus: item.audioStatus,
    clips: item.clips.map((clip) => ({
      url: clip.url,
      durationMs: clip.durationMs,
      kind: clip.kind,
    })),
  }));
  return {
    id: pkg.id,
    date: pkg.date,
    targetLang: pkg.targetLang,
    status: String(pkg.status),
    audioReady: pkg.audioReady,
    audioDone: pkg.audioDone,
    audioTotal: pkg.audioTotal,
    downloadable: isMobilePackDownloadable({
      status: String(pkg.status),
      items,
    }),
    items,
  };
}

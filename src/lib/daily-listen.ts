import type { DailyItemType } from "@prisma/client";
import type { ListenItem } from "~/hooks/use-listen-player";
import type { PlaybackClip } from "~/lib/satz-tts";

export type DailyListenSource = {
  id: string;
  itemType: DailyItemType;
  targetText: string;
  nativeText: string;
  tenseLabel: string | null;
  domain: { id: string; name: string } | null;
  questionText?: string | null;
  questionTranslation?: string | null;
  clips: PlaybackClip[];
  audioStatus: string;
};

export function toDailyListenItem(item: DailyListenSource): ListenItem {
  const badges = [
    item.domain?.name,
    item.tenseLabel,
    item.itemType === "SATZ"
      ? undefined
      : item.itemType === "ENTRY"
        ? undefined
        : item.tenseLabel,
  ].filter((value): value is string => Boolean(value));

  return {
    id: item.id,
    mainText:
      item.itemType === "CONJUGATION" && item.tenseLabel
        ? `${item.targetText} · ${item.tenseLabel}`
        : item.targetText,
    translationText: item.nativeText,
    targetText: item.targetText,
    nativeText: item.nativeText,
    questionText: item.questionText ?? null,
    questionTranslation: item.questionTranslation ?? null,
    extraText: item.domain?.name ?? null,
    badges: badges.filter((value, index) => badges.indexOf(value) === index),
    clips: item.clips,
    audioStatus: item.audioStatus,
  };
}

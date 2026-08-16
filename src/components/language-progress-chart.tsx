"use client";

import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";

type LeitnerTrack = {
  boxes: {
    new: number;
    box1: number;
    box2: number;
    box3: number;
    box4: number;
    box5: number;
    box6: number;
  };
  total: number;
  mastered: number;
  masteryPercentage: number;
};

interface LanguageProgressChartProps {
  data: Array<{
    language: string;
    languageName: string;
    vocab: LeitnerTrack;
    conjugations: LeitnerTrack;
    masteryPercent?: number;
    levelKey?: string;
  }>;
  showLanguageHeader?: boolean;
}

type BoxKey = keyof LeitnerTrack["boxes"];

const BOX_COLORS: Record<BoxKey, string> = {
  new: "bg-gray-400 dark:bg-gray-500",
  box1: "bg-red-400",
  box2: "bg-orange-400",
  box3: "bg-yellow-400",
  box4: "bg-lime-400",
  box5: "bg-green-400",
  box6: "bg-emerald-500",
};

function LeitnerBar({
  track,
  segments,
}: {
  track: LeitnerTrack;
  segments: Array<{ key: BoxKey; fullLabel: string }>;
}) {
  return (
    <div className="flex h-7 w-full overflow-hidden rounded-md bg-white ring-1 ring-[#1e3a5f]/10">
      {segments.map(({ key, fullLabel }) => {
        const count = track.boxes[key];
        if (count === 0 || track.total === 0) return null;

        const percentage = (count / track.total) * 100;
        const showLabel = percentage >= 6;

        return (
          <div
            key={key}
            className={cn(
              BOX_COLORS[key],
              "flex shrink-0 items-center justify-center",
            )}
            style={{ width: `${percentage}%` }}
            title={`${fullLabel}: ${count}`}
          >
            {showLabel ? (
              <span className="text-xs font-semibold text-white drop-shadow-sm">
                {count}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function TrackRow({
  label,
  track,
  masteryLabel,
  segments,
}: {
  label: string;
  track: LeitnerTrack;
  masteryLabel: string;
  segments: Array<{ key: BoxKey; fullLabel: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-right text-xs text-muted-foreground">
          {masteryLabel}
        </span>
      </div>
      <LeitnerBar track={track} segments={segments} />
    </div>
  );
}

export function LanguageProgressChart({
  data,
  showLanguageHeader = true,
}: LanguageProgressChartProps) {
  const t = useTranslations("progressChart");
  const tGame = useTranslations("gamification");

  const segments: Array<{ key: BoxKey; fullLabel: string }> = [
    { key: "new", fullLabel: t("boxNew") },
    { key: "box1", fullLabel: t("box1") },
    { key: "box2", fullLabel: t("box2") },
    { key: "box3", fullLabel: t("box3") },
    { key: "box4", fullLabel: t("box4") },
    { key: "box5", fullLabel: t("box5") },
    { key: "box6", fullLabel: t("box6") },
  ];

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {data.map((lang) => (
          <div key={lang.language} className="space-y-3">
            {showLanguageHeader || lang.masteryPercent !== undefined ? (
              <div className="flex flex-wrap items-center gap-2">
                {showLanguageHeader ? (
                  <>
                    <span className="font-medium">{lang.languageName}</span>
                    <Badge variant="outline">{lang.language.toUpperCase()}</Badge>
                  </>
                ) : null}
                {lang.masteryPercent !== undefined ? (
                  <Badge variant="secondary">
                    {tGame("masteryBadge", { percent: lang.masteryPercent })}
                  </Badge>
                ) : null}
                {lang.levelKey ? (
                  <Badge variant="outline">
                    {tGame(`levels.${lang.levelKey}` as "levels.beginner")}
                  </Badge>
                ) : null}
              </div>
            ) : null}

            <TrackRow
              label={t("trackVocab")}
              track={lang.vocab}
              masteryLabel={t("mastery", {
                percent: lang.vocab.masteryPercentage,
                mastered: lang.vocab.mastered,
                total: lang.vocab.total,
              })}
              segments={segments}
            />

            {lang.conjugations.total > 0 ? (
              <TrackRow
                label={t("trackConjugations")}
                track={lang.conjugations}
                masteryLabel={t("mastery", {
                  percent: lang.conjugations.masteryPercentage,
                  mastered: lang.conjugations.mastered,
                  total: lang.conjugations.total,
                })}
                segments={segments}
              />
            ) : null}
          </div>
        ))}

        <div className="border-t pt-4">
          <div className="mb-2 text-xs font-medium">{t("leitnerBoxesTitle")}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {segments.map(({ key, fullLabel }) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={cn("h-3 w-3 rounded-sm", BOX_COLORS[key])} />
                <span>{fullLabel}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

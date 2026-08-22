"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  inBoxesTotal,
  sliceGrowthDays,
  stackTotal,
  type GrowthCounts,
  type GrowthDay,
  type GrowthKind,
  type GrowthRange,
} from "~/lib/vocabulary-growth";

type SeriesKey = GrowthKind | "waiting";

type Series = { key: SeriesKey; color: string };

const IN_BOX_SERIES: Series[] = [
  { key: "vocab", color: "#3d6ea8" },
  { key: "satze", color: "#c4a35a" },
  { key: "conjugations", color: "#5a8f7b" },
];

const WAITING_SERIES: Series = {
  key: "waiting",
  color: "var(--cahier-red, #d45d5d)",
};

const AREA_SERIES: Series[] = [...IN_BOX_SERIES, WAITING_SERIES];

const PAD = { top: 10, right: 8, bottom: 22, left: 36 };
const AREA_HEIGHT = 176;
const BAR_HEIGHT = 132;
const VIEW_WIDTH = 720;

type VocabularyGrowthChartProps = {
  daily: GrowthDay[];
  cumulative: GrowthDay[];
  waitingPool: number;
};

export function VocabularyGrowthChart({
  daily,
  cumulative,
  waitingPool,
}: VocabularyGrowthChartProps) {
  const t = useTranslations("growthChart");
  const [range, setRange] = useState<GrowthRange>(90);

  const slicedDaily = useMemo(
    () => sliceGrowthDays(daily, range),
    [daily, range],
  );
  const slicedCumulative = useMemo(
    () => sliceGrowthDays(cumulative, range),
    [cumulative, range],
  );
  const today = slicedDaily.at(-1);
  const todayIntake = today ? inBoxesTotal(today) : 0;
  const latest = slicedCumulative.at(-1);
  const latestInBoxes = latest ? inBoxesTotal(latest) : 0;
  const latestWaiting = latest?.waiting ?? waitingPool;

  const labels: Record<SeriesKey, string> = {
    vocab: t("trackVocab"),
    satze: t("trackSatze"),
    conjugations: t("trackConjugations"),
    waiting: t("trackWaiting"),
  };

  return (
    <Card className="mb-8">
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <div className="inline-flex shrink-0 rounded-md border border-input">
          {(
            [
              [30, t("range30")],
              [90, t("range90")],
              ["all", t("rangeAll")],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={String(value)}
              type="button"
              size="sm"
              variant={range === value ? "secondary" : "ghost"}
              className="rounded-none first:rounded-l-md last:rounded-r-md"
              aria-pressed={range === value}
              onClick={() => setRange(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">{t("waitingPoolLabel")}</span>{" "}
            <span className="font-semibold tabular-nums text-[var(--cahier-red,#d45d5d)]">
              {latestWaiting}
            </span>
          </p>
          <p>
            <span className="text-muted-foreground">{t("todayIntakeLabel")}</span>{" "}
            <span className="font-semibold tabular-nums">{todayIntake}</span>
          </p>
          <p>
            <span className="text-muted-foreground">{t("inBoxesLabel")}</span>{" "}
            <span className="font-semibold tabular-nums">{latestInBoxes}</span>
          </p>
        </div>

        {slicedCumulative.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <>
            <PlotBlock
              title={t("cumulativeTitle")}
              days={slicedCumulative}
              mode="area"
              series={AREA_SERIES}
              totalOf={stackTotal}
              labels={labels}
            />
            <PlotBlock
              title={t("dailyTitle")}
              days={slicedDaily}
              mode="bars"
              series={IN_BOX_SERIES}
              totalOf={inBoxesTotal}
              labels={labels}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
              {AREA_SERIES.map((series) => (
                <div key={series.key} className="flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded-sm"
                    style={{ background: series.color }}
                  />
                  <span>{labels[series.key]}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PlotBlock({
  title,
  days,
  mode,
  series,
  totalOf,
  labels,
}: {
  title: string;
  days: GrowthDay[];
  mode: "area" | "bars";
  series: Series[];
  totalOf: (counts: GrowthCounts) => number;
  labels: Record<SeriesKey, string>;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const height = mode === "area" ? AREA_HEIGHT : BAR_HEIGHT;
  const innerW = VIEW_WIDTH - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const maxValue = Math.max(1, ...days.map((day) => totalOf(day)));
  const hovered = hover != null ? days[hover] : null;

  const toX = (index: number) => {
    if (days.length <= 1) return PAD.left + innerW / 2;
    return PAD.left + (index / (days.length - 1)) * innerW;
  };
  const toY = (value: number) => PAD.top + innerH - (value / maxValue) * innerH;

  const ticks = yTicks(maxValue);

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <h4 className="text-sm font-medium">{title}</h4>
        {hovered ? (
          <p className="text-xs tabular-nums text-muted-foreground">
            {formatDateLabel(hovered.date)}
            {" · "}
            {series
              .map((item) => `${labels[item.key]} ${hovered[item.key]}`)
              .join(" · ")}
          </p>
        ) : null}
      </div>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        className="h-auto w-full cursor-crosshair"
        role="img"
        aria-label={title}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH;
          const t = (x - PAD.left) / innerW;
          const index = Math.round(
            Math.min(1, Math.max(0, t)) * Math.max(days.length - 1, 0),
          );
          setHover(index);
        }}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={VIEW_WIDTH - PAD.right}
              y1={toY(tick)}
              y2={toY(tick)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={toY(tick) + 3}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {tick}
            </text>
          </g>
        ))}

        {mode === "area"
          ? series.map((item, layer) => (
              <path
                key={item.key}
                d={stackedAreaPath(days, series, layer, toX, toY)}
                fill={item.color}
                fillOpacity={item.key === "waiting" ? 0.85 : 0.78}
              />
            ))
          : days.map((day, index) => {
              const slot = innerW / days.length;
              const barW = Math.max(1, slot * 0.72);
              const x =
                days.length === 1
                  ? PAD.left + (innerW - barW) / 2
                  : PAD.left + index * slot + (slot - barW) / 2;
              let yBase = PAD.top + innerH;
              return (
                <g key={day.date}>
                  {series.map((item) => {
                    const value = day[item.key];
                    if (value <= 0) return null;
                    const h = (value / maxValue) * innerH;
                    const y = yBase - h;
                    yBase = y;
                    return (
                      <rect
                        key={item.key}
                        x={x}
                        y={y}
                        width={barW}
                        height={h}
                        fill={item.color}
                        opacity={0.9}
                      />
                    );
                  })}
                </g>
              );
            })}

        {hover != null && days[hover] ? (
          <line
            x1={toX(hover)}
            x2={toX(hover)}
            y1={PAD.top}
            y2={PAD.top + innerH}
            className="stroke-[var(--cahier-ink,#1e3a5f)]"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.45}
          />
        ) : null}

        {xLabels(days).map(({ index, label }) => (
          <text
            key={days[index]!.date}
            x={toX(index)}
            y={height - 6}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function stackedAreaPath(
  days: GrowthDay[],
  series: Series[],
  layer: number,
  toX: (index: number) => number,
  toY: (value: number) => number,
): string {
  const top = days.map((day) => stackValue(day, series, layer + 1));
  const bottom = days.map((day) => stackValue(day, series, layer));
  if (days.length === 1) {
    const x0 = toX(0) - 12;
    const x1 = toX(0) + 12;
    return [
      `M ${x0} ${toY(bottom[0]!)}`,
      `L ${x0} ${toY(top[0]!)}`,
      `L ${x1} ${toY(top[0]!)}`,
      `L ${x1} ${toY(bottom[0]!)}`,
      "Z",
    ].join(" ");
  }
  const forward = days.map((_, index) => `${toX(index)} ${toY(top[index]!)}`);
  const back = days
    .map((_, index) => `${toX(index)} ${toY(bottom[index]!)}`)
    .reverse();
  return `M ${forward[0]} L ${forward.slice(1).join(" L ")} L ${back.join(" L ")} Z`;
}

function stackValue(day: GrowthDay, series: Series[], layer: number): number {
  let sum = 0;
  for (let index = 0; index < layer; index += 1) {
    const key = series[index]?.key;
    if (key) sum += day[key];
  }
  return sum;
}

function yTicks(maxValue: number): number[] {
  const step =
    maxValue <= 4
      ? 1
      : maxValue <= 10
        ? 2
        : maxValue <= 25
          ? 5
          : maxValue <= 50
            ? 10
            : maxValue <= 100
              ? 20
              : maxValue <= 250
                ? 50
                : Math.ceil(maxValue / 5 / 100) * 100;
  const ticks: number[] = [];
  for (let value = 0; value < maxValue; value += step) {
    ticks.push(value);
  }
  ticks.push(maxValue);
  return ticks;
}

function xLabels(days: GrowthDay[]): Array<{ index: number; label: string }> {
  if (days.length === 0) return [];
  if (days.length === 1) {
    return [{ index: 0, label: formatDateLabel(days[0]!.date) }];
  }
  const mid = Math.floor((days.length - 1) / 2);
  const indexes = Array.from(new Set([0, mid, days.length - 1]));
  return indexes.map((index) => ({
    index,
    label: formatDateLabel(days[index]!.date),
  }));
}

function formatDateLabel(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(day)}.${Number(month)}.`;
}

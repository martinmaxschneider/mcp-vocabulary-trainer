"use client";

import { useTranslations } from "next-intl";
import { cn } from "~/lib/utils";

export type SessionBoxCounts = Record<1 | 2 | 3 | 4 | 5 | 6, number>;

const BOX_COLORS: Record<keyof SessionBoxCounts, string> = {
  1: "bg-red-400",
  2: "bg-orange-400",
  3: "bg-yellow-400",
  4: "bg-lime-400",
  5: "bg-green-400",
  6: "bg-emerald-500",
};

const BOXES = [1, 2, 3, 4, 5, 6] as const;

export function ReviewBoxBar({ remaining }: { remaining: SessionBoxCounts }) {
  const tCommon = useTranslations("common");
  const total = BOXES.reduce((sum, box) => sum + remaining[box], 0);
  if (total === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-600">
        {BOXES.map((box) => {
          const count = remaining[box];
          if (count === 0) return null;
          return (
            <span key={box} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-sm", BOX_COLORS[box])} />
              {tCommon("box", { number: box })}
            </span>
          );
        })}
      </div>
      <div className="flex h-7 w-full overflow-hidden rounded-md bg-white ring-1 ring-[#1e3a5f]/10">
        {BOXES.map((box) => {
          const count = remaining[box];
          if (count === 0) return null;
          const percentage = (count / total) * 100;
          return (
            <div
              key={box}
              className={cn(
                BOX_COLORS[box],
                "flex shrink-0 items-center justify-center",
              )}
              style={{ width: `${percentage}%` }}
              title={`${tCommon("box", { number: box })}: ${count}`}
            >
              {percentage >= 6 ? (
                <span className="text-xs font-semibold text-white drop-shadow-sm">
                  {count}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function remainingBoxCounts(
  initial: SessionBoxCounts | undefined,
  completedBoxes: number[],
): SessionBoxCounts {
  const next = { ...(initial ?? emptySessionBoxCounts()) };
  for (const box of completedBoxes) {
    if (box >= 1 && box <= 6) {
      const key = box as keyof SessionBoxCounts;
      next[key] = Math.max(0, next[key] - 1);
    }
  }
  return next;
}

export function emptySessionBoxCounts(): SessionBoxCounts {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
}

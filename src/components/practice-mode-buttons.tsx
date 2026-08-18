"use client";

import { useTranslations } from "next-intl";
import { Dumbbell, Headphones, Sparkles } from "lucide-react";
import { cn } from "~/lib/utils";

const tileClass =
  "flex h-auto flex-col items-start gap-1 rounded-xl border px-4 py-4 text-left transition";

export function PracticeModeButtons({
  onReview,
  onPractice,
  onListen,
  reviewDisabled,
}: {
  onReview: () => void;
  onPractice: () => void;
  onListen: () => void;
  reviewDisabled?: boolean;
}) {
  const t = useTranslations("practiceModes");
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <button
        type="button"
        onClick={onListen}
        className={cn(
          tileClass,
          "border-[#1e3a5f] bg-[#1e3a5f] text-white hover:bg-[#16304d]",
        )}
      >
        <span className="flex items-center gap-2 font-semibold">
          <Headphones className="h-4 w-4" />
          {t("listen")}
        </span>
        <span className="text-xs font-normal text-white">{t("listenHint")}</span>
      </button>
      <button
        type="button"
        onClick={onPractice}
        className={cn(
          tileClass,
          "border-slate-200 bg-white text-[#1e3a5f] hover:border-[#1e3a5f]/40",
        )}
      >
        <span className="flex items-center gap-2 font-semibold">
          <Dumbbell className="h-4 w-4" />
          {t("practice")}
        </span>
        <span className="text-xs font-normal text-slate-500">
          {t("practiceHint")}
        </span>
      </button>
      <button
        type="button"
        disabled={reviewDisabled}
        onClick={onReview}
        className={cn(
          tileClass,
          reviewDisabled
            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
            : "border-[#d45d5d] bg-[#d45d5d] text-white hover:bg-[#c04d4d]",
        )}
      >
        <span className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-4 w-4" />
          {t("review")}
        </span>
        <span
          className={cn(
            "text-xs font-normal",
            reviewDisabled ? "text-slate-400" : "text-white/90",
          )}
        >
          {t("reviewHint")}
        </span>
      </button>
    </div>
  );
}

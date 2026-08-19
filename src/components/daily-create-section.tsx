"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DailyPackageStatus } from "@prisma/client";
import { ArrowLeft, CalendarDays, Loader2 } from "lucide-react";
import { Caveat, Libre_Baskerville } from "next/font/google";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useFocusLang } from "~/components/focus-lang-provider";
import { useToast } from "~/hooks/use-toast";
import {
  DAILY_TIME_PRESETS,
  DEFAULT_DAILY_CONFIG,
  MAX_DAILY_COUNT,
  estimatePackageDurationMs,
} from "~/lib/daily";
import { resolveErrorCode } from "~/lib/trpc-error";
import { cn } from "~/lib/utils";

const caveat = Caveat({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
});

const libreBaskerville = Libre_Baskerville({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

export function DailyCreateSection() {
  const t = useTranslations("daily");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("languages");
  const tErrors = useTranslations("errors.codes");
  const { focusLang } = useFocusLang();
  const router = useRouter();
  const { toast } = useToast();
  const utils = api.useUtils();

  const [satzCount, setSatzCount] = useState(DEFAULT_DAILY_CONFIG.satzCount);
  const [vocabCount, setVocabCount] = useState(DEFAULT_DAILY_CONFIG.vocabCount);
  const [conjCount, setConjCount] = useState(DEFAULT_DAILY_CONFIG.conjCount);
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  const todayQuery = api.daily.today.useQuery({ targetLang: focusLang });
  const grammarQuery = api.grammar.listByLang.useQuery({ targetLang: focusLang });
  const createPackage = api.daily.createPackage.useMutation();
  const updateSettings = api.daily.updateSettings.useMutation();

  const data = todayQuery.data;
  const pool = data?.pool ?? { satz: 0, vocab: 0, conj: 0 };
  const todayPkg = data?.package ?? null;
  const packages = data?.packages ?? [];
  const hasCompletedToday = packages.some(
    (row) =>
      row.date === data?.date && row.status === DailyPackageStatus.PRODUCTIVE,
  );

  useEffect(() => {
    setDefaultsApplied(false);
  }, [focusLang]);

  useEffect(() => {
    if (!data || defaultsApplied) return;
    setSatzCount(data.settings.lastPackageConfig.satzCount);
    setVocabCount(data.settings.lastPackageConfig.vocabCount);
    setConjCount(data.settings.lastPackageConfig.conjCount);
    setDefaultsApplied(true);
  }, [data, defaultsApplied]);

  const applyPreset = (minutes: number) => {
    const preset = DAILY_TIME_PRESETS.find((row) => row.minutes === minutes);
    if (!preset) return;
    setSatzCount(Math.min(preset.satzCount, Math.max(pool.satz, 0)));
    setVocabCount(Math.min(preset.vocabCount, Math.max(pool.vocab, 0)));
    setConjCount(Math.min(preset.conjCount, Math.max(pool.conj, 0)));
  };

  const estimatedMs = estimatePackageDurationMs([
    ...Array.from({ length: satzCount }, () => ({ itemType: "SATZ" as const })),
    ...Array.from({ length: vocabCount }, () => ({ itemType: "ENTRY" as const })),
    ...Array.from({ length: conjCount }, () => ({
      itemType: "CONJUGATION" as const,
    })),
  ]);

  const blocked =
    todayPkg &&
    (todayPkg.status === "ACTIVE" || todayPkg.status === "TESTING");

  if (todayQuery.isLoading) {
    return (
      <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="text-[#1e3a5f] hover:bg-white/70 hover:text-[#1e3a5f]"
        >
          <Link href="/daily">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("backToOverview")}
          </Link>
        </Button>
        <p className={cn("text-lg text-red-600", caveat.className)}>
          {t("kicker")}
        </p>
        <h1
          className={cn(
            "text-4xl font-bold text-[#1e3a5f]",
            libreBaskerville.className,
          )}
        >
          {hasCompletedToday ? t("configTitleNext") : t("configTitle")}
        </h1>
        <p className="text-sm text-slate-600">
          {t("subtitle", { language: tLang(focusLang) })}
        </p>
      </header>

      {blocked ? (
        <Card>
          <CardContent className="space-y-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">{t("createBlocked")}</p>
            <Button asChild>
              <Link href="/daily">{t("backToOverview")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="cahier-card">
          <CardContent className="space-y-6 px-6 py-8">
            <div className="flex flex-wrap gap-2">
              {DAILY_TIME_PRESETS.map((preset) => (
                <Button
                  key={preset.minutes}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(preset.minutes)}
                >
                  {t("presetMinutes", { minutes: preset.minutes })}
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              <Label>{t("grammarTopic")}</Label>
              <Select
                value={data?.settings.currentGrammarTopicId ?? "none"}
                onValueChange={(value) => {
                  updateSettings.mutate({
                    targetLang: focusLang,
                    currentGrammarTopicId: value === "none" ? null : value,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("grammarTopicNone")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("grammarTopicNone")}</SelectItem>
                  {(grammarQuery.data ?? []).map((topic) => (
                    <SelectItem key={topic.id} value={topic.id}>
                      {topic.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <SliderRow
              label={t("satzSlider")}
              value={satzCount}
              max={Math.min(MAX_DAILY_COUNT, Math.max(pool.satz, 1))}
              available={pool.satz}
              onChange={setSatzCount}
            />
            <SliderRow
              label={t("vocabSlider")}
              value={vocabCount}
              max={Math.min(MAX_DAILY_COUNT, Math.max(pool.vocab, 1))}
              available={pool.vocab}
              onChange={setVocabCount}
            />
            <SliderRow
              label={t("conjSlider")}
              value={conjCount}
              max={Math.min(MAX_DAILY_COUNT, Math.max(pool.conj, 1))}
              available={pool.conj}
              onChange={setConjCount}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {t("packageSummary", {
                  count: satzCount + vocabCount + conjCount,
                  minutes: Math.max(1, Math.round(estimatedMs / 60000)),
                })}
              </p>
              <Button
                onClick={async () => {
                  try {
                    await createPackage.mutateAsync({
                      targetLang: focusLang,
                      satzCount,
                      vocabCount,
                      conjCount,
                    });
                    await utils.daily.today.invalidate({ targetLang: focusLang });
                    router.push("/daily");
                  } catch (error) {
                    const message =
                      error instanceof Error ? error.message : "";
                    const code = resolveErrorCode(message);
                    toast({
                      title: t("createError"),
                      description: code
                        ? tErrors(code as "NOT_FOUND")
                        : message || undefined,
                      variant: "destructive",
                    });
                  }
                }}
                disabled={
                  createPackage.isPending ||
                  satzCount + vocabCount + conjCount === 0
                }
              >
                {createPackage.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CalendarDays className="mr-2 h-4 w-4" />
                )}
                {t("createPackage")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SliderRow({
  label,
  value,
  max,
  available,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  available: number;
  onChange: (value: number) => void;
}) {
  const cap = Math.max(0, max);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <Label>{label}</Label>
        <span className="tabular-nums text-muted-foreground">
          {value} / {available}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={cap}
        value={Math.min(value, cap)}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-primary"
        disabled={cap === 0}
      />
    </div>
  );
}

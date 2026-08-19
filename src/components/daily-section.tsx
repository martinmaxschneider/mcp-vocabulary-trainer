"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { DailyItemType, DailyPackageStatus } from "@prisma/client";
import {
  CalendarDays,
  Headphones,
  Loader2,
  Plus,
  Quote,
  Repeat,
  Sparkles,
  Star,
  Volume2,
} from "lucide-react";
import { Caveat, Libre_Baskerville } from "next/font/google";
import { api } from "~/trpc/client";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { DailyTestSession } from "~/components/daily-test-session";
import { StatsWidget } from "~/components/stats-widget";
import { useFocusLang } from "~/components/focus-lang-provider";
import { useCelebrate } from "~/components/gamification-provider";
import { CELEBRATIONS } from "~/lib/gamification-config";
import { useToast } from "~/hooks/use-toast";
import { drainAudioQueue } from "~/lib/process-audio-queue";
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

function typeIcon(type: DailyItemType) {
  if (type === "SATZ") return Quote;
  if (type === "CONJUGATION") return Repeat;
  return Volume2;
}

function formatDailyDate(date: string, locale: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DailySection() {
  const t = useTranslations("daily");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("languages");
  const locale = useLocale();
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const { focusLang } = useFocusLang();
  const celebrate = useCelebrate();
  const { toast } = useToast();
  const utils = api.useUtils();
  const searchParams = useSearchParams();
  const urlPackageId = searchParams.get("id");

  const [generating, setGenerating] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(urlPackageId);
  const [testOverview, setTestOverview] = useState(false);

  const todayQuery = api.daily.today.useQuery({ targetLang: focusLang });

  const activatePackage = api.daily.activatePackage.useMutation();
  const submitAnswer = api.daily.submitTestAnswer.useMutation();
  const completePackage = api.daily.completePackage.useMutation();
  const abandonPackage = api.daily.abandonPackage.useMutation();
  const processAudio = api.daily.processAudio.useMutation();

  const data = todayQuery.data;
  const todayPkg = data?.package ?? null;
  const packages = data?.packages ?? [];
  const selectedQuery = api.daily.getPackage.useQuery(
    { id: selectedId ?? "" },
    { enabled: Boolean(selectedId) && selectedId !== todayPkg?.id },
  );
  const pkg =
    selectedId && selectedId !== todayPkg?.id
      ? (selectedQuery.data ?? null)
      : todayPkg;
  const pool = data?.pool ?? { satz: 0, vocab: 0, conj: 0 };
  const due = data?.due ?? { vocab: 0, satz: 0, conj: 0 };
  const burndown = data?.burndown;
  const highlightedId = selectedId ?? todayPkg?.id ?? packages[0]?.id ?? null;

  useEffect(() => {
    setShowResults(false);
    setSelectedId(urlPackageId);
    setTestOverview(false);
  }, [focusLang, urlPackageId]);

  const pendingItems = pkg?.items.filter((item) => item.testResult === "PENDING") ?? [];
  const currentTestItem = pendingItems[0];

  const invalidate = () => {
    void utils.daily.today.invalidate({ targetLang: focusLang });
    if (selectedId) {
      void utils.daily.getPackage.invalidate({ id: selectedId });
    }
    void utils.stats.dashboard.invalidate();
  };

  const showError = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : "";
    const code = resolveErrorCode(message);
    toast({
      title: fallback,
      description: code ? tErrors(code as "NOT_FOUND") : message || undefined,
      variant: "destructive",
    });
  };

  const generateAudio = async () => {
    if (!pkg) return;
    setGenerating(true);
    try {
      await drainAudioQueue((limit) => processAudio.mutateAsync({ limit }));
      await invalidate();
      toast({ title: tToasts("dailyAudioDone") });
    } catch (error) {
      showError(error, tToasts("dailyAudioError"));
    } finally {
      setGenerating(false);
    }
  };

  const maybeComplete = async (id: string) => {
    const current = await utils.daily.getPackage.fetch({ id });
    if (!current || current.status !== "TESTING") return;
    if (current.items.some((item) => item.testResult === "PENDING")) {
      await invalidate();
      return;
    }
    try {
      const result = await completePackage.mutateAsync({ id });
      if (result.gamification) {
        const answers = result.package.items.length;
        const correct = result.package.items.filter(
          (item) => item.testResult === "CORRECT",
        ).length;
        celebrate(result.gamification, {
          perfectSession:
            answers >= (CELEBRATIONS.perfectSession.minCards ?? 10) &&
            correct === answers,
          sessionAnswers: answers,
        });
      }
      setShowResults(true);
      await invalidate();
    } catch (error) {
      showError(error, t("completeError"));
    }
  };

  if (todayQuery.isLoading) {
    return (
      <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
    );
  }

  if (pkg?.status === "TESTING" && currentTestItem && !testOverview) {
    return (
      <DailyTestSession
        item={currentTestItem}
        cardsLeft={Math.max(0, pendingItems.length - 1)}
        focusLang={focusLang}
        pending={submitAnswer.isPending || completePackage.isPending}
        onBack={() => setTestOverview(true)}
        onSubmit={async (isCorrect) => {
          try {
            const result = await submitAnswer.mutateAsync({
              itemId: currentTestItem.id,
              isCorrect,
            });
            if (result.gamification) celebrate(result.gamification);
            await maybeComplete(pkg.id);
          } catch (error) {
            showError(error, t("completeError"));
          }
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-2">
        <p className={cn("text-lg text-red-600", caveat.className)}>{t("kicker")}</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1
            className={cn(
              "text-4xl font-bold text-[#1e3a5f]",
              libreBaskerville.className,
            )}
          >
            {t("title")}
          </h1>
          {!todayPkg ? (
            <Button asChild>
              <Link href="/daily/create">
                <Plus className="mr-2 h-4 w-4" />
                {t("newPackage")}
              </Link>
            </Button>
          ) : null}
        </div>
        <p className="text-sm text-slate-600">
          {t("subtitle", { language: tLang(focusLang) })}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatsWidget
          title={t("dueToday")}
          value={due.vocab + due.satz + due.conj}
          description={t("dueBreakdown", {
            vocab: due.vocab,
            satz: due.satz,
            conj: due.conj,
          })}
          icon={<Repeat className="h-4 w-4 text-muted-foreground" />}
        />
        <StatsWidget
          title={t("newSaetze")}
          value={pool.satz}
          icon={<Quote className="h-4 w-4 text-muted-foreground" />}
        />
        <StatsWidget
          title={t("newVocabConj")}
          value={`${pool.vocab} / ${pool.conj}`}
          icon={<Volume2 className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("dueBlockTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{t("dueBlockHint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/review?start=1">
                {t("reviewVocab", { count: due.vocab })}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/sentences/review?start=1">
                {t("reviewSaetze", { count: due.satz })}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/practice/conjugations?start=1">
                {t("reviewConj", { count: due.conj })}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {showResults && pkg?.status === "PRODUCTIVE" ? (
        <CompletedCard
          pkg={pkg}
          burndown={burndown}
          due={due}
          onReset={() => setShowResults(false)}
        />
      ) : null}

      {packages.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("listTitle")}</CardTitle>
            <CardDescription>{t("listHint")}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {packages.map((row) => {
                const isToday = row.date === data?.date;
                const isSelected = row.id === highlightedId;
                return (
                  <li key={row.id}>
                    <div
                      className={cn(
                        "flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between",
                        isSelected ? "bg-muted/50" : "hover:bg-muted/30",
                      )}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          setSelectedId(row.id);
                          setShowResults(
                            row.status === DailyPackageStatus.PRODUCTIVE,
                          );
                        }}
                      >
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span>{formatDailyDate(row.date, locale)}</span>
                          {isToday ? (
                            <Badge variant="secondary">{t("todayBadge")}</Badge>
                          ) : null}
                          <Badge
                            variant={
                              row.status === DailyPackageStatus.PRODUCTIVE
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {t(`status${row.status}`)}
                          </Badge>
                        </p>
                        <p className="mt-1 pl-6 text-sm text-muted-foreground">
                          {t("itemCount", { count: row.itemCount })}
                          {row.status === DailyPackageStatus.PRODUCTIVE
                            ? ` · ${t("todayDoneScore", {
                                correct: row.correctCount,
                                total: row.itemCount,
                              })}`
                            : row.answeredCount > 0
                              ? ` · ${t("testProgress", {
                                  current: row.answeredCount,
                                  total: row.itemCount,
                                })}`
                              : ""}
                        </p>
                      </button>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        {row.status === DailyPackageStatus.ACTIVE ? (
                          <>
                            <Button asChild size="sm">
                              <Link href={`/daily/listen?id=${row.id}`}>
                                <Headphones className="mr-2 h-4 w-4" />
                                {t("openPlayer")}
                              </Link>
                            </Button>
                          </>
                        ) : null}
                        {row.status === DailyPackageStatus.TESTING ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedId(row.id);
                              setTestOverview(false);
                            }}
                          >
                            {t("continueTest")}
                          </Button>
                        ) : null}
                        {row.status === DailyPackageStatus.PRODUCTIVE ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedId(row.id);
                              setShowResults(true);
                            }}
                          >
                            {t("viewResults")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {pkg?.status === "DRAFT" ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">
              {t("previewTitle", { count: pkg.items.length })}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await abandonPackage.mutateAsync({ id: pkg.id });
                setSelectedId(null);
                await invalidate();
              }}
            >
              {t("abandon")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {t("audioProgress", {
                    done: pkg.audioDone,
                    total: pkg.audioTotal,
                  })}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={generateAudio}
                  disabled={generating || pkg.audioReady}
                >
                  {generating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Headphones className="mr-2 h-4 w-4" />
                  )}
                  {pkg.audioReady ? t("audioReady") : t("generateAudio")}
                </Button>
              </div>
              <Progress
                value={
                  pkg.audioTotal > 0
                    ? (pkg.audioDone / pkg.audioTotal) * 100
                    : 0
                }
              />
            </div>
            <ul className="space-y-2">
              {pkg.items.map((item, index) => {
                const Icon = typeIcon(item.itemType);
                return (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="tabular-nums text-muted-foreground">
                          {index + 1}.
                        </span>
                        <span className="truncate">{item.targetText}</span>
                      </p>
                      <p className="truncate pl-6 text-xs text-muted-foreground">
                        {item.nativeText}
                        {item.tenseLabel ? ` · ${item.tenseLabel}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {item.domain ? (
                        <Badge variant="outline">{item.domain.name}</Badge>
                      ) : null}
                      {item.grammarTopicBonusApplied ? (
                        <Star className="h-3.5 w-3.5 text-orange-500" />
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {item.answerClips.length > 0 ? "🔊 ✓" : "🔊 …"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex justify-end">
              <Button
                disabled={!pkg.audioReady || activatePackage.isPending}
                onClick={async () => {
                  try {
                    await activatePackage.mutateAsync({ id: pkg.id });
                    await invalidate();
                  } catch (error) {
                    showError(error, t("activateError"));
                  }
                }}
              >
                {activatePackage.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {t("startPackage")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {pkg?.status === "TESTING" && currentTestItem ? (
        <div className="flex justify-center">
          <Button onClick={() => setTestOverview(false)}>
            {t("continueTest")}
          </Button>
        </div>
      ) : null}

      {pkg?.status === "TESTING" && !currentTestItem ? (
        <div className="flex justify-center">
          <Button
            onClick={() => void maybeComplete(pkg.id)}
            disabled={completePackage.isPending}
          >
            {completePackage.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {t("finishPackage")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CompletedCard({
  pkg,
  burndown,
  due,
  onReset,
}: {
  pkg: {
    correctCount: number;
    items: Array<{ testResult: string }>;
  };
  burndown?: {
    estimatedDays: { total: number | null };
    open: { satz: number; vocab: number; conj: number };
  };
  due: { vocab: number; satz: number; conj: number };
  onReset: () => void;
}) {
  const t = useTranslations("daily");
  const wrong = pkg.items.length - pkg.correctCount;
  const hasDue = due.vocab + due.satz + due.conj > 0;
  return (
    <Card>
      <CardContent className="space-y-4 py-10 text-center">
        <Sparkles className="mx-auto h-10 w-10 text-orange-500" />
        <h2 className="text-2xl font-bold">{t("completedTitle")}</h2>
        <p className="text-lg">
          {t("todayDoneScore", {
            correct: pkg.correctCount,
            total: pkg.items.length,
          })}
        </p>
        <p className="text-sm text-muted-foreground">{t("leitnerMoved")}</p>
        {wrong > 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("wrongNextDay", { count: wrong })}
          </p>
        ) : null}
        {burndown ? (
          <p className="text-sm text-muted-foreground">
            {t("poolAfter", {
              satz: burndown.open.satz,
              vocab: burndown.open.vocab,
              conj: burndown.open.conj,
            })}
            {burndown.estimatedDays.total != null
              ? ` · ${t("burndownEstimate", { days: burndown.estimatedDays.total })}`
              : ""}
          </p>
        ) : null}
        {hasDue ? (
          <div className="flex flex-wrap justify-center gap-2">
            {due.vocab > 0 ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/review?start=1">
                  {t("reviewVocab", { count: due.vocab })}
                </Link>
              </Button>
            ) : null}
            {due.satz > 0 ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/sentences/review?start=1">
                  {t("reviewSaetze", { count: due.satz })}
                </Link>
              </Button>
            ) : null}
            {due.conj > 0 ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/practice/conjugations?start=1">
                  {t("reviewConj", { count: due.conj })}
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
        <Button onClick={onReset}>{t("backToOverview")}</Button>
      </CardContent>
    </Card>
  );
}

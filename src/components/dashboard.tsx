"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { StatsWidget } from "~/components/stats-widget";
import { LanguageProgressChart } from "~/components/language-progress-chart";
import { VocabularyGrowthChart } from "~/components/vocabulary-growth-chart";
import { GamificationOverview } from "~/components/gamification-overview";
import {
  BookOpen,
  FileText,
  MessageSquare,
  AlertTriangle,
  Sparkles,
  BookA,
  BookText,
  Quote,
  Repeat,
} from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { useFocusLang } from "~/components/focus-lang-provider";
import { getTargetLang } from "~/lib/languages";
import { isConjugatableLang } from "~/lib/conjugation-catalog";

const SHOW_ALL_STORAGE_KEY = "sprachen-dashboard-show-all";

const hydrateSubscribe = () => () => {};
const getHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;

type LeitnerTrack = {
  boxes: { new: number };
  total: number;
};

function inBoxesOverTotal(
  progress: Array<{
    vocab: LeitnerTrack;
    conjugations: LeitnerTrack;
    satze: LeitnerTrack;
  }>,
  keys: Array<"vocab" | "conjugations" | "satze">,
) {
  let inBoxes = 0;
  let total = 0;
  for (const lang of progress) {
    for (const key of keys) {
      const track = lang[key];
      total += track.total;
      inBoxes += track.total - track.boxes.new;
    }
  }
  return { inBoxes, total };
}

function readShowAll(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SHOW_ALL_STORAGE_KEY) === "1";
}

export function Dashboard() {
  const t = useTranslations("dashboard");
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("languages");
  const { focusLang } = useFocusLang();
  const hydrated = useSyncExternalStore(
    hydrateSubscribe,
    getHydratedSnapshot,
    getServerHydratedSnapshot,
  );
  const [showAll, setShowAllState] = useState(false);
  const currentLang = getTargetLang(focusLang);

  useEffect(() => {
    setShowAllState(readShowAll());
  }, []);

  const setShowAll = (next: boolean) => {
    setShowAllState(next);
    window.localStorage.setItem(SHOW_ALL_STORAGE_KEY, next ? "1" : "0");
  };

  const { data: stats, isLoading } = api.stats.dashboard.useQuery({
    targetLang: showAll ? undefined : focusLang,
  });
  const { data: growth } = api.stats.vocabularyGrowth.useQuery({
    targetLang: showAll ? undefined : focusLang,
  });
  const { data: game } = api.gamification.getStatus.useQuery();

  const languageProgress =
    stats?.languageProgress.map((lang) => {
      const extra = game?.languages.find((row) => row.language === lang.language);
      return {
        ...lang,
        languageName: tLang(lang.language),
        masteryPercent: extra?.masteryPercent,
        levelKey: extra?.levelKey,
      };
    }) ?? [];

  const inventory = useMemo(() => {
    const tracks = stats?.languageProgress ?? [];
    return {
      overall: inBoxesOverTotal(tracks, ["vocab", "satze"]),
      sentences: inBoxesOverTotal(tracks, ["satze"]),
      words: inBoxesOverTotal(tracks, ["vocab"]),
      conjugations: inBoxesOverTotal(tracks, ["conjugations"]),
    };
  }, [stats?.languageProgress]);

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="mb-2 text-4xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="inline-flex rounded-md border border-input">
          <Button
            type="button"
            size="sm"
            variant={!showAll ? "secondary" : "ghost"}
            className="rounded-r-none gap-2"
            aria-pressed={!showAll}
            onClick={() => setShowAll(false)}
          >
            <span aria-hidden>{currentLang?.flag}</span>
            {t("showFocusLang", { language: tLang(focusLang) })}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={showAll ? "secondary" : "ghost"}
            className="rounded-l-none"
            aria-pressed={showAll}
            onClick={() => setShowAll(true)}
          >
            {t("showAllLanguages")}
          </Button>
        </div>
      </div>

      {!hydrated || isLoading || !stats ? (
        <p className="text-muted-foreground">{tCommon("loading")}</p>
      ) : (
        <>
          <GamificationOverview focusLang={focusLang} showAll={showAll} />
          <div className="mb-8 grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-4">
            <StatsWidget
              title={t("dueToday")}
              value={stats.dueCount}
              description={t("dueDesc")}
              icon={<BookOpen className="h-4 w-4 text-muted-foreground" />}
              pulse={stats.dueCount > 0}
            />
            <StatsWidget
              title={t("dueSentences")}
              value={stats.dueSatzCount}
              description={t("startSatzReview")}
              icon={<Quote className="h-4 w-4 text-muted-foreground" />}
              href="/sentences/review?start=1"
            />
            <StatsWidget
              title={t("dueWords")}
              value={stats.dueVocabCount}
              description={
                showAll ? t("startVocabReviewAllDesc") : t("startVocabReview")
              }
              icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
              href={showAll ? "/review?start=1&mode=multi" : "/review?start=1"}
            />
            <StatsWidget
              title={t("dueConjugations")}
              value={stats.dueConjCount}
              description={t("startConjugationReview")}
              icon={<Repeat className="h-4 w-4 text-muted-foreground" />}
              href="/practice/conjugations?start=1"
              disabled={!isConjugatableLang(focusLang)}
            />
          </div>

          <div className="mb-8 grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-4">
            <StatsWidget
              title={t("total")}
              value={inventory.overall.inBoxes}
              total={inventory.overall.total}
              description={t("inBoxesOverTotal")}
              icon={<FileText className="h-4 w-4 text-muted-foreground" />}
            />
            <StatsWidget
              title={t("sentencesTotal")}
              value={inventory.sentences.inBoxes}
              total={inventory.sentences.total}
              description={t("inBoxesOverTotal")}
              icon={<Quote className="h-4 w-4 text-muted-foreground" />}
            />
            <StatsWidget
              title={t("wordsTotal")}
              value={inventory.words.inBoxes}
              total={inventory.words.total}
              description={t("inBoxesOverTotal")}
              icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
            />
            <StatsWidget
              title={t("conjugationsTotal")}
              value={inventory.conjugations.inBoxes}
              total={inventory.conjugations.total}
              description={t("inBoxesOverTotal")}
              icon={<Repeat className="h-4 w-4 text-muted-foreground" />}
            />
          </div>

          <div className="mb-8 grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-4">
            <StatsWidget
              title={tNav("verbs")}
              value={stats.verbCount}
              description={t("verbsDesc")}
              icon={<BookOpen className="h-4 w-4 text-muted-foreground" />}
            />
            <StatsWidget
              title={tNav("nouns")}
              value={stats.nounCount}
              description={t("nounsDesc")}
              icon={<BookText className="h-4 w-4 text-muted-foreground" />}
            />
            <StatsWidget
              title={tNav("adjectives")}
              value={stats.adjectiveCount}
              description={t("adjectivesDesc")}
              icon={<BookA className="h-4 w-4 text-muted-foreground" />}
            />
            <StatsWidget
              title={tNav("proverbs")}
              value={stats.proverbCategoryCount}
              description={t("proverbsDesc")}
              icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
            />
          </div>

          <LanguageProgressChart
            data={languageProgress}
            showLanguageHeader={showAll}
          />

          {growth ? (
            <VocabularyGrowthChart
              daily={growth.daily}
              cumulative={growth.cumulative}
              waitingPool={
                inventory.overall.total -
                inventory.overall.inBoxes +
                (inventory.conjugations.total - inventory.conjugations.inBoxes)
              }
            />
          ) : null}

          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                {t("problemCards")}
              </CardTitle>
              <CardDescription>{t("problemCardsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.topWrong.length === 0 ? (
                <p className="text-muted-foreground">{t("noProblemCards")}</p>
              ) : (
                <div className="cahier-section space-y-2.5">
                  {stats.topWrong.map((card) => (
                    <div
                      key={card.id}
                      className="cahier-item flex items-center justify-between p-3"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{card.mainText}</span>
                          <Badge variant="outline" className="text-xs">
                            {card.type}
                          </Badge>
                          {showAll ? (
                            <Badge variant="secondary" className="text-xs">
                              {card.targetLang.toUpperCase()}
                            </Badge>
                          ) : null}
                          {card.isLeech && (
                            <Badge variant="destructive" className="text-xs">
                              {t("leechBadge")}
                            </Badge>
                          )}
                        </div>
                        {card.domain && (
                          <p className="text-sm text-muted-foreground">
                            {card.domain}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-center">
                          <div className="font-semibold text-green-600">
                            {card.correctCount}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {t("statsCorrect")}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="font-semibold text-red-600">
                            {card.wrongCount}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {t("statsWrong")}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="font-semibold">{card.successRate}%</div>
                          <div className="text-xs text-muted-foreground">
                            {t("statsSuccess")}
                          </div>
                        </div>
                        <Badge variant="secondary">
                          {tCommon("box", { number: card.box })}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("domainsCardTitle")}</CardTitle>
              <CardDescription>{t("domainsCardDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.domainStats.length === 0 ? (
                <p className="mb-4 text-muted-foreground">
                  {t("noDomainsYet")}
                </p>
              ) : (
                <div className="cahier-section mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {stats.domainStats.map((domain) => (
                    <div
                      key={domain.name}
                      className="cahier-item flex items-center justify-between p-2"
                    >
                      <span className="font-medium">{domain.name}</span>
                      <Badge variant="secondary">
                        {t("domainEntryCount", { count: domain.count })}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
              <Link href="/domains">
                <Button variant="outline" className="w-full">
                  {t("manageDomains")}
                </Button>
              </Link>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { api } from "~/trpc/server";
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
import {
  BookOpen,
  FileText,
  MessageSquare,
  AlertTriangle,
  Sparkles,
  BookA,
  BookText,
} from "lucide-react";
import { Badge } from "~/components/ui/badge";

export default async function HomePage() {
  const t = await getTranslations("dashboard");
  const tNav = await getTranslations("nav");
  const tCommon = await getTranslations("common");
  const tLang = await getTranslations("languages");
  const stats = await api.stats.dashboard();

  const languageProgress = stats.languageProgress.map((lang) => ({
    ...lang,
    languageName: tLang(
      lang.language,
    ),
  }));

  return (
    <>
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatsWidget
          title={t("dueToday")}
          value={stats.dueCount}
          description={t("dueDesc")}
          icon={<BookOpen className="h-4 w-4 text-muted-foreground" />}
        />
        <StatsWidget
          title={t("total")}
          value={stats.totalEntries}
          description={t("totalDesc")}
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
        />
        <StatsWidget
          title={t("words")}
          value={stats.wordCount}
          description={t("wordsDesc")}
          icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
        />
        <StatsWidget
          title={tNav("domains")}
          value={stats.domainStats.length}
          description={t("domainsDesc")}
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
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

        <LanguageProgressChart data={languageProgress} />

        {stats.dueCount > 0 && (
          <Card className="mb-8 border-primary">
            <CardHeader>
              <CardTitle>{t("readyToReview")}</CardTitle>
              <CardDescription>
                {t("cardsWaiting", { count: stats.dueCount })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/review">
                <Button size="lg" className="w-full sm:w-auto">
                  <BookOpen className="mr-2 h-5 w-5" />
                  {t("startReview")}
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              {t("problemCards")}
            </CardTitle>
            <CardDescription>
              {t("problemCardsDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.topWrong.length === 0 ? (
              <p className="text-muted-foreground">
                {t("noProblemCards")}
              </p>
            ) : (
              <div className="space-y-3">
                {stats.topWrong.map((card) => (
                  <div
                    key={card.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{card.mainText}</span>
                        <Badge variant="outline" className="text-xs">
                          {card.type}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {card.targetLang.toUpperCase()}
                        </Badge>
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
                        <div className="text-green-600 font-semibold">
                          {card.correctCount}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t("statsCorrect")}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-red-600 font-semibold">
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

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("domainsCardTitle")}</CardTitle>
              <CardDescription>
                {t("domainsCardDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.domainStats.length === 0 ? (
                <p className="text-muted-foreground mb-4">
                  {t("noDomainsYet")}
                </p>
              ) : (
                <div className="space-y-2 mb-4">
                  {stats.domainStats.map((domain) => (
                    <div
                      key={domain.name}
                      className="flex items-center justify-between p-2 rounded-lg border"
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

          <Card>
            <CardHeader>
              <CardTitle>{t("quickActions")}</CardTitle>
              <CardDescription>{t("quickActionsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/entries/new">
                <Button variant="outline" className="w-full justify-start">
                  <FileText className="mr-2 h-4 w-4" />
                  {t("addNewEntry")}
                </Button>
              </Link>
              <Link href="/practice/conjugations">
                <Button variant="outline" className="w-full justify-start">
                  <BookOpen className="mr-2 h-4 w-4" />
                  {t("practiceConjugations")}
                </Button>
              </Link>
              <Link href="/domains">
                <Button variant="outline" className="w-full justify-start">
                  <BookOpen className="mr-2 h-4 w-4" />
                  {t("browseDomains")}
                </Button>
              </Link>
              <Link href="/settings">
                <Button variant="outline" className="w-full justify-start">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {t("openSettings")}
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
</>
  );
}

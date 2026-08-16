"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { WordCategory } from "@prisma/client";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  SOURCE_LANG,
  TARGET_LANGS,
  isTargetLang,
  type LearningLangCode,
} from "~/lib/languages";
import { Eye, LayoutGrid, List, Plus } from "lucide-react";
import { ClickableIpa } from "~/components/clickable-ipa";
import { useFocusLang } from "~/components/focus-lang-provider";

type SortBy = "mainText" | "translation" | "createdAt";
type SortDir = "asc" | "desc";
type VocabView = "cards" | "list";

const VIEW_STORAGE_KEY = "sprachen-vocab-view";

function readStoredView(): VocabView {
  if (typeof window === "undefined") return "cards";
  return window.localStorage.getItem(VIEW_STORAGE_KEY) === "list"
    ? "list"
    : "cards";
}

const CATEGORY_I18N_KEY: Record<
  WordCategory,
  | "verb"
  | "noun"
  | "adjective"
  | "proverb"
  | "adverb"
  | "preposition"
  | "conjunction"
  | "pronoun"
  | "other"
> = {
  VERB: "verb",
  NOUN: "noun",
  ADJECTIVE: "adjective",
  PROVERB: "proverb",
  ADVERB: "adverb",
  PREPOSITION: "preposition",
  CONJUNCTION: "conjunction",
  PRONOUN: "pronoun",
  OTHER: "other",
};

const LIST_META: Record<
  WordCategory,
  { titleKey: "verbsListTitle" | "nounsListTitle" | "adjectivesListTitle" | "proverbsListTitle"; emptyKey: "verbsEmpty" | "nounsEmpty" | "adjectivesEmpty" | "proverbsEmpty" }
> = {
  VERB: { titleKey: "verbsListTitle", emptyKey: "verbsEmpty" },
  NOUN: { titleKey: "nounsListTitle", emptyKey: "nounsEmpty" },
  ADJECTIVE: { titleKey: "adjectivesListTitle", emptyKey: "adjectivesEmpty" },
  PROVERB: { titleKey: "proverbsListTitle", emptyKey: "proverbsEmpty" },
  ADVERB: { titleKey: "verbsListTitle", emptyKey: "verbsEmpty" },
  PREPOSITION: { titleKey: "verbsListTitle", emptyKey: "verbsEmpty" },
  CONJUNCTION: { titleKey: "verbsListTitle", emptyKey: "verbsEmpty" },
  PRONOUN: { titleKey: "verbsListTitle", emptyKey: "verbsEmpty" },
  OTHER: { titleKey: "verbsListTitle", emptyKey: "verbsEmpty" },
};

type VocabularyCategoryListProps = {
  category: WordCategory;
  addHref: string;
  detailHref: (id: string) => string;
};

export function VocabularyCategoryList({
  category,
  addHref,
  detailHref,
}: VocabularyCategoryListProps) {
  const t = useTranslations("vocabulary");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("languages");
  const tCategories = useTranslations("categories");
  const tNav = useTranslations("nav");

  const { focusLang: targetLang, setFocusLang } = useFocusLang();
  const setTargetLang = (code: string) => {
    if (isTargetLang(code)) setFocusLang(code as LearningLangCode);
  };
  const [onlyWithTranslation, setOnlyWithTranslation] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("mainText");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [view, setView] = useState<VocabView>("cards");

  useEffect(() => {
    setView(readStoredView());
  }, []);

  const setVocabView = (next: VocabView) => {
    setView(next);
    window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  };

  const queryInput = useMemo(
    () => ({
      category,
      targetLang,
      onlyWithTranslation,
      sortBy,
      sortDir,
      limit: 50,
    }),
    [category, targetLang, onlyWithTranslation, sortBy, sortDir]
  );

  const { data, isLoading, isFetching, fetchNextPage, hasNextPage } =
    api.entry.listByCategory.useInfiniteQuery(queryInput, {
      getNextPageParam: (last) => last.nextCursor,
    });

  const entries = data?.pages.flatMap((p) => p.entries) ?? [];
  const categoryBadge = tCategories(CATEGORY_I18N_KEY[category] ?? "other");
  const { titleKey, emptyKey } = LIST_META[category];
  const targetLangName = tLang(targetLang);

  const guideQuery = api.pronunciation.getByPair.useQuery({
    nativeLang: SOURCE_LANG.code,
    targetLang,
  });
  const guideItems = guideQuery.data?.items ?? [];

  return (
    <div className="max-w-6xl">
      <div className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="mb-2 text-4xl font-bold">{t(titleKey)}</h1>
            <p className="text-muted-foreground">
              {isLoading
                ? t("listLoading")
                : hasNextPage
                  ? t("listCountMore", { count: entries.length })
                  : t("listCount", { count: entries.length })}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex rounded-md border border-input">
              <Button
                type="button"
                size="icon"
                variant={view === "cards" ? "secondary" : "ghost"}
                className="rounded-r-none"
                aria-label={t("viewCards")}
                aria-pressed={view === "cards"}
                onClick={() => setVocabView("cards")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant={view === "list" ? "secondary" : "ghost"}
                className="rounded-l-none"
                aria-label={t("viewList")}
                aria-pressed={view === "list"}
                onClick={() => setVocabView("list")}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            <Link href={addHref}>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {tNav("add")}
              </Button>
            </Link>
          </div>
        </div>

        <div className="cahier-section mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-1.5">
            <Label>{tLang("targetLanguage")}</Label>
            <Select value={targetLang} onValueChange={setTargetLang}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGET_LANGS.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.flag}{" "}
                    {tLang(lang.code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{tLang("sortLabel")}</Label>
            <Select
              value={sortBy}
              onValueChange={(v) => {
                const next = v as SortBy;
                setSortBy(next);
                if (next === "createdAt") setSortDir("desc");
                else setSortDir("asc");
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mainText">
                  {tLang("sortBySource", { language: tLang(SOURCE_LANG.code) })}
                </SelectItem>
                <SelectItem value="translation">
                  {tLang("sortByTranslation", { language: targetLangName })}
                </SelectItem>
                <SelectItem value="createdAt">
                  {tLang("sortByCreatedAt")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{tLang("sortDirection")}</Label>
            <Select
              value={sortDir}
              onValueChange={(v) => setSortDir(v as SortDir)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">{tLang("sortAsc")}</SelectItem>
                <SelectItem value="desc">{tLang("sortDesc")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 pb-2 sm:ml-2">
            <Checkbox
              id="only-with-translation"
              checked={onlyWithTranslation}
              onCheckedChange={(checked) =>
                setOnlyWithTranslation(checked === true)
              }
            />
            <Label htmlFor="only-with-translation" className="cursor-pointer">
              {t("onlyWithTranslation")}
            </Label>
          </div>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{tCommon("loadingEntries")}</p>
          </CardContent>
        </Card>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="mb-4 text-muted-foreground">{t(emptyKey)}</p>
            <Link href={addHref}>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("addFirst")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {view === "list" ? (
            <div className="cahier-section space-y-2">
              <div className="hidden px-3 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_1fr_auto] sm:gap-3">
                <span>{tLang(SOURCE_LANG.code)}</span>
                <span>{targetLangName}</span>
                <span className="w-10" />
              </div>
              {entries.map((entry) => {
                const translation = entry.translations.find(
                  (tr) => tr.lang === targetLang
                );
                return (
                  <div
                    key={entry.id}
                    className="cahier-item grid items-center gap-2 p-3 sm:grid-cols-[1fr_1fr_auto] sm:gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground sm:hidden">
                        {tLang(SOURCE_LANG.code)}
                      </p>
                      <p className="font-medium">{entry.mainText}</p>
                      {entry.domains.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {entry.domains.map((d) => (
                            <Badge
                              key={d.id}
                              variant="secondary"
                              className="text-xs"
                            >
                              {d.domain.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground sm:hidden">
                        {targetLangName}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium">
                          {translation?.text ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </span>
                        {translation?.ipa ? (
                          <ClickableIpa
                            ipa={translation.ipa}
                            items={guideItems}
                            className="m-0 text-sm italic tracking-wide text-foreground/80"
                            showFullListButton={false}
                            targetLangName={targetLangName}
                          />
                        ) : null}
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button size="icon" variant="ghost" asChild>
                        <Link href={detailHref(entry.id)}>
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">{tCommon("details")}</span>
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {entries.map((entry) => {
                const translation = entry.translations.find(
                  (tr) => tr.lang === targetLang
                );
                return (
                  <Card
                    key={entry.id}
                    className="transition-shadow hover:shadow-md"
                  >
                    <CardHeader>
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant="outline">{categoryBadge}</Badge>
                      </div>
                      <CardTitle className="text-xl">{entry.mainText}</CardTitle>
                      {entry.note && (
                        <CardDescription className="mt-2">
                          {entry.note}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <p className="mb-1 text-sm font-medium text-muted-foreground">
                          {targetLangName}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-base">
                            {translation?.text ?? (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </p>
                          {translation?.ipa ? (
                            <div className="ml-auto shrink-0 text-right">
                              <ClickableIpa
                                ipa={translation.ipa}
                                items={guideItems}
                                className="m-0 text-sm italic tracking-wide text-foreground/80"
                                showFullListButton={false}
                                targetLangName={targetLangName}
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {entry.domains.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {entry.domains.map((d) => (
                            <Badge
                              key={d.id}
                              variant="secondary"
                              className="text-xs"
                            >
                              {d.domain.name}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <Link href={detailHref(entry.id)}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 w-full"
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          {tCommon("details")}
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {hasNextPage && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                onClick={() => void fetchNextPage()}
                disabled={isFetching}
              >
                {isFetching ? tCommon("loadingMore") : tCommon("loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

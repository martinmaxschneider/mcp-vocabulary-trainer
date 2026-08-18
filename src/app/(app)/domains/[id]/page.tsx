"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Badge } from "~/components/ui/badge";
import {
  ArrowLeft,
  ChevronDown,
  LayoutGrid,
  List,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";
import { useToast } from "~/hooks/use-toast";
import { useFocusLang } from "~/components/focus-lang-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { resolveErrorCode } from "~/lib/trpc-error";
import { ClickableIpa } from "~/components/clickable-ipa";
import { SOURCE_LANG, TARGET_LANG_CODES } from "~/lib/languages";

const VIEW_STORAGE_KEY = "sprachen-domain-view";
type DomainView = "cards" | "list";
type DomainTypeFilter = "ALL" | "WORD" | "PROVERB" | "SENTENCE";

function readStoredView(): DomainView {
  if (typeof window === "undefined") return "cards";
  return window.localStorage.getItem(VIEW_STORAGE_KEY) === "list"
    ? "list"
    : "cards";
}

export default function DomainDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("domains");
  const tCategories = useTranslations("categories");
  const tSentences = useTranslations("sentences");
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("languages");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const utils = api.useUtils();

  const addToDomainLinks = [
    { href: `/vocabulary/verbs?domainId=${id}`, label: tNav("verbs") },
    { href: `/vocabulary/nouns?domainId=${id}`, label: tNav("nouns") },
    {
      href: `/vocabulary/adjectives?domainId=${id}`,
      label: tNav("adjectives"),
    },
    { href: `/vocabulary/proverbs?domainId=${id}`, label: tNav("proverbs") },
    { href: `/sentences/new?domainId=${id}`, label: tNav("sentences") },
  ] as const;
  const [typeFilter, setTypeFilter] = useState<DomainTypeFilter>("ALL");
  const [view, setView] = useState<DomainView>("cards");
  const { focusLang } = useFocusLang();

  useEffect(() => {
    setView(readStoredView());
  }, []);

  const setDomainView = (next: DomainView) => {
    setView(next);
    window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  };

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrors(code as "NOT_FOUND") : message;
  };

  const entryTypeLabel = (type: "WORD" | "PROVERB") =>
    type === "WORD"
      ? tCategories("entryTypeWord")
      : tCategories("entryTypeProverb");

  const { data: domains } = api.domain.list.useQuery();
  const domainMeta = domains?.find((d) => d.id === id);

  const { data, refetch } = api.entry.list.useQuery({
    domainId: id,
    type:
      typeFilter === "ALL" || typeFilter === "SENTENCE"
        ? undefined
        : typeFilter,
  });

  const { data: satzData } = api.satz.list.useQuery({
    domainId: id,
    limit: 200,
  });

  const guidesQuery = api.pronunciation.getByPairs.useQuery({
    nativeLang: SOURCE_LANG.code,
    targetLangs: [...TARGET_LANG_CODES],
  });

  const guideItemsByLang = useMemo(() => {
    const map: Record<
      string,
      Array<{
        id: string;
        symbol: string;
        approx: string | null;
        explanation: string;
        exampleWord: string | null;
      }>
    > = {};
    for (const entry of guidesQuery.data?.guides ?? []) {
      map[entry.targetLang] = entry.guide?.items ?? [];
    }
    return map;
  }, [guidesQuery.data]);

  const deleteMutation = api.entry.delete.useMutation({
    onSuccess: () => {
      toast({ title: tToasts("entryDeleted") });
      void refetch();
      void utils.domain.list.invalidate();
    },
    onError: (error) => {
      toast({
        title: tToasts("entryDeleteError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const deleteSatzMutation = api.satz.delete.useMutation({
    onSuccess: () => {
      toast({ title: tToasts("satzDeleted") });
      void utils.satz.list.invalidate();
      void utils.domain.list.invalidate();
    },
    onError: (error) => {
      toast({
        title: tToasts("satzDeleteError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const handleDelete = (entryId: string, entryName: string) => {
    if (confirm(tCommon("confirmDelete", { name: entryName }))) {
      deleteMutation.mutate({ id: entryId });
    }
  };

  const handleDeleteSatz = (satzId: string, satzText: string) => {
    if (confirm(tCommon("confirmDelete", { name: satzText }))) {
      deleteSatzMutation.mutate({ id: satzId });
    }
  };

  const handleEdit = (entryId: string) => {
    router.push(`/entries/${entryId}/edit`);
  };

  const entries =
    typeFilter === "SENTENCE" ? [] : (data?.entries ?? []);
  const satze =
    typeFilter === "WORD" || typeFilter === "PROVERB"
      ? []
      : (satzData?.items ?? []);
  const isEmpty = entries.length === 0 && satze.length === 0;
  const domainName = domainMeta?.name ?? t("detailDefaultName");

  return (
    <>
      <div className="mb-8">
        <Link href="/domains">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("back")}
          </Button>
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">{domainName}</h1>
            <p className="text-muted-foreground">
              {t("countWords", { count: domainMeta?.wordCount ?? 0 })}
              {" · "}
              {t("countSentences", { count: domainMeta?.satzCount ?? 0 })}
              {" · "}
              {t("countVerbs", { count: domainMeta?.verbCount ?? 0 })}
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
                onClick={() => setDomainView("cards")}
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
                onClick={() => setDomainView("list")}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            <Select
              value={typeFilter}
              onValueChange={(value) =>
                setTypeFilter(value as DomainTypeFilter)
              }
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("filterAllTypes")}</SelectItem>
                <SelectItem value="WORD">{t("filterWords")}</SelectItem>
                <SelectItem value="SENTENCE">{t("filterSentences")}</SelectItem>
                <SelectItem value="PROVERB">{t("filterProverbs")}</SelectItem>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("addEntry")}
                  <ChevronDown className="ml-2 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {addToDomainLinks.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link href={item.href} className="cursor-pointer">
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {isEmpty ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">{t("emptyDomain")}</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("addFirstEntry")}
                  <ChevronDown className="ml-2 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                {addToDomainLinks.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link href={item.href} className="cursor-pointer">
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>
      ) : (
        view === "list" ? (
          <div className="cahier-section space-y-2">
            <div className="hidden px-3 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[7rem_1fr_1fr_auto] sm:gap-3">
              <span />
              <span>{tLang(SOURCE_LANG.code)}</span>
              <span>{tLang(focusLang)}</span>
              <span className="w-20" />
            </div>
            {satze.map((satz) => {
              const translation = satz.translations.find(
                (tr) => tr.lang === focusLang
              );
              return (
                <div
                  key={satz.id}
                  className="cahier-item grid items-center gap-2 p-3 sm:grid-cols-[7rem_1fr_1fr_auto] sm:gap-3"
                >
                  <Badge variant="outline" className="w-fit">
                    {t("typeSentence")}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground sm:hidden">
                      {tLang(SOURCE_LANG.code)}
                    </p>
                    <p className="font-medium">{satz.mainText}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground sm:hidden">
                      {tLang(focusLang)}
                    </p>
                    <span className="font-medium">
                      {translation?.text ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => router.push(`/sentences/${satz.id}/edit`)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDeleteSatz(satz.id, satz.mainText)}
                      disabled={deleteSatzMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {entries.map((entry) => {
              const translation = entry.translations.find(
                (tr) => tr.lang === focusLang
              );
              return (
                <div
                  key={entry.id}
                  className="cahier-item grid items-center gap-2 p-3 sm:grid-cols-[7rem_1fr_1fr_auto] sm:gap-3"
                >
                  <Badge variant="outline" className="w-fit">
                    {entryTypeLabel(entry.type)}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground sm:hidden">
                      {tLang(SOURCE_LANG.code)}
                    </p>
                    <p className="font-medium">{entry.mainText}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground sm:hidden">
                      {tLang(focusLang)}
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
                          items={guideItemsByLang[focusLang] ?? []}
                          className="m-0 text-sm italic tracking-wide text-foreground/80"
                          showFullListButton={false}
                          targetLangName={tLang(focusLang)}
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleEdit(entry.id)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(entry.id, entry.mainText)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {satze.map((satz) => (
            <Card key={satz.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="outline">{t("typeSentence")}</Badge>
                    </div>
                    <CardTitle className="text-lg">{satz.mainText}</CardTitle>
                    {satz.trigger ? (
                      <CardDescription className="mt-2">
                        {tSentences("triggerPrefix")}: {satz.trigger}
                      </CardDescription>
                    ) : null}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => router.push(`/sentences/${satz.id}/edit`)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDeleteSatz(satz.id, satz.mainText)}
                      disabled={deleteSatzMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="cahier-section space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("translationsLabel")}
                  </p>
                  {satz.translations.map((translation) => (
                    <div
                      key={translation.id}
                      className="cahier-item p-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Badge variant="secondary" className="text-xs">
                          {translation.lang.toUpperCase()}
                        </Badge>
                        <span className="font-medium">{translation.text}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {entries.map((entry) => (
            <Card key={entry.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">
                        {entryTypeLabel(entry.type)}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg">{entry.mainText}</CardTitle>
                    {entry.note && (
                      <CardDescription className="mt-2">
                        {entry.note}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleEdit(entry.id)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(entry.id, entry.mainText)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="cahier-section space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("translationsLabel")}
                  </p>
                  {entry.translations.map((translation) => (
                    <div
                      key={translation.id}
                      className="cahier-item p-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Badge variant="secondary" className="text-xs">
                          {translation.lang.toUpperCase()}
                        </Badge>
                        <span className="font-medium">{translation.text}</span>
                        {translation.ipa ? (
                          <div className="ml-auto shrink-0 text-right">
                            <ClickableIpa
                              ipa={translation.ipa}
                              items={guideItemsByLang[translation.lang] ?? []}
                              className="m-0 text-sm italic tracking-wide text-foreground/80"
                              showFullListButton={false}
                              targetLangName={tLang(translation.lang)}
                            />
                          </div>
                        ) : null}
                      </div>
                      {translation.example && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {translation.example}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        )
      )}
    </>
  );
}

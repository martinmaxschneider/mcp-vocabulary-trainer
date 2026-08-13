"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRight, Search } from "lucide-react";
import { api } from "~/trpc/client";
import { TARGET_LANGS, type LearningLangCode } from "~/lib/languages";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";

const KNOWN_CATEGORIES = [
  "basics",
  "verbs",
  "pronouns",
  "word_order",
  "adjectives",
  "prepositions",
] as const;

function categoryLabel(
  category: string,
  t: ReturnType<typeof useTranslations<"grammar">>,
): string {
  if ((KNOWN_CATEGORIES as readonly string[]).includes(category)) {
    return t(`categories.${category}` as "categories.basics");
  }
  return category;
}

export function GrammarBrowser() {
  const t = useTranslations("grammar");
  const tLang = useTranslations("languages");
  const defaultLang: LearningLangCode = TARGET_LANGS[0]?.code ?? "en";
  const [activeLang, setActiveLang] = useState<LearningLangCode>(defaultLang);
  const [query, setQuery] = useState("");

  const listQuery = api.grammar.listByLang.useQuery({ targetLang: activeLang });
  const searchQuery = api.grammar.search.useQuery(
    { targetLang: activeLang, query: query.trim() },
    { enabled: query.trim().length > 0 },
  );

  const topics = query.trim() ? (searchQuery.data ?? []) : (listQuery.data ?? []);
  const isLoading = query.trim()
    ? searchQuery.isLoading
    : listQuery.isLoading;

  const grouped = useMemo(() => {
    const map = new Map<string, typeof topics>();
    for (const topic of topics) {
      const list = map.get(topic.category) ?? [];
      list.push(topic);
      map.set(topic.category, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [topics]);

  return (
    <div className="space-y-6">
      <Tabs
        value={activeLang}
        onValueChange={(v) => setActiveLang(v as LearningLangCode)}
      >
        <TabsList className="flex h-auto flex-wrap gap-1">
          {TARGET_LANGS.map((lang) => (
            <TabsTrigger key={lang.code} value={lang.code}>
              {tLang(lang.code)}
            </TabsTrigger>
          ))}
        </TabsList>

        {TARGET_LANGS.map((lang) => (
          <TabsContent key={lang.code} value={lang.code} className="space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={lang.code === activeLang ? query : ""}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="pl-9"
              />
            </div>

            {lang.code !== activeLang ? null : isLoading ? (
              <p className="text-sm text-muted-foreground">{t("loading")}</p>
            ) : topics.length === 0 ? (
              <div className="cahier-card p-8 text-center">
                <p className="text-muted-foreground">{t("empty")}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("emptyHint")}
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {grouped.map(([category, items]) => (
                  <section
                    key={category}
                    className="cahier-section space-y-3"
                  >
                    <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#1e3a5f]">
                      {categoryLabel(category, t)}
                    </h2>
                    <ul className="space-y-2.5">
                      {items.map((topic) => (
                        <li key={topic.id}>
                          <Link
                            href={`/grammar/${topic.id}`}
                            className="cahier-item cahier-item-hover group flex items-start justify-between gap-4 px-4 py-3.5"
                          >
                            <div className="flex min-w-0 gap-3">
                              <span className="cahier-accent" />
                              <div className="min-w-0 space-y-1">
                                <div className="font-semibold text-[#1e3a5f]">
                                  {topic.title}
                                </div>
                                <p className="text-sm leading-relaxed text-slate-600">
                                  {topic.summary}
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                              <Badge
                                variant="secondary"
                                className="bg-[#eef4fa] text-[#1e3a5f]"
                              >
                                {t("blockCount", { count: topic.blockCount })}
                              </Badge>
                              <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#1e3a5f]" />
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

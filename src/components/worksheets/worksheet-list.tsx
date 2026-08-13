"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { api } from "~/trpc/client";
import { TARGET_LANGS, type LearningLangCode } from "~/lib/languages";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";

export function WorksheetList() {
  const t = useTranslations("worksheets");
  const tLang = useTranslations("languages");
  const defaultLang: LearningLangCode = TARGET_LANGS[0]?.code ?? "en";
  const [activeLang, setActiveLang] = useState<LearningLangCode>(defaultLang);

  const listQuery = api.worksheet.list.useQuery({ targetLang: activeLang });
  const worksheets = listQuery.data ?? [];

  return (
    <div className="space-y-6">
      <Tabs
        value={activeLang}
        onValueChange={(value) => setActiveLang(value as LearningLangCode)}
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
            {lang.code === activeLang && listQuery.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("loading")}
              </div>
            ) : null}

            {lang.code === activeLang && !listQuery.isLoading && worksheets.length === 0 ? (
              <div className="cahier-card p-8 text-center">
                <p className="font-medium">{t("empty")}</p>
                <p className="mt-2 text-sm text-muted-foreground">{t("emptyHint")}</p>
              </div>
            ) : null}

            {lang.code === activeLang ? (
              <div className="grid gap-4 md:grid-cols-2">
                {worksheets.map((ws) => (
                  <Link
                    key={ws.id}
                    href={`/worksheets/${ws.id}`}
                    className="cahier-item cahier-item-hover group p-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={ws.status === "COMPLETED" ? "secondary" : "outline"}
                        className={cn(
                          ws.status === "IN_PROGRESS" && "border-amber-400 text-amber-700",
                        )}
                      >
                        {t(`status.${ws.status}`)}
                      </Badge>
                      <Badge variant="outline">{ws.section}</Badge>
                    </div>
                    <h2 className="mt-3 text-xl font-semibold text-[#1e3a5f]">{ws.title}</h2>
                    {ws.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {ws.description}
                      </p>
                    ) : null}
                    <p className="mt-3 text-sm text-muted-foreground">
                      {t("questionCount", { count: ws.questionCount })}
                      {ws.status === "COMPLETED"
                        ? ` · ${t("score", { score: ws.score, max: ws.max })}`
                        : null}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(ws.createdAt).toLocaleDateString()}
                    </p>
                  </Link>
                ))}
              </div>
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

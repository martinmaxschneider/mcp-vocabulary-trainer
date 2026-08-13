"use client";

import { use, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SOURCE_LANG, TARGET_LANGS, TARGET_LANG_CODES } from "~/lib/languages";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ConjugationTable } from "~/components/conjugation-table";
import { DomainAssignment } from "~/components/domain-assignment";
import { ClickableIpa } from "~/components/clickable-ipa";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";
import { ArrowLeft, Pencil, Trash2, Loader2 } from "lucide-react";
import { CONJUGATABLE_LANGS } from "~/lib/conjugation-catalog";

export default function VerbDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("vocabulary");
  const tCommon = useTranslations("common");
  const tCategories = useTranslations("categories");
  const tLang = useTranslations("languages");
  const tConjugations = useTranslations("conjugations");
  const tToasts = useTranslations("toasts");
  const tEntries = useTranslations("entries");
  const tErrorCodes = useTranslations("errors.codes");
  const router = useRouter();
  const { toast } = useToast();
  const [savingLang, setSavingLang] = useState<string | null>(null);

  const { data: verb, isLoading, refetch } = api.entry.getById.useQuery({ id });
  const {
    data: conjugationData,
    isLoading: conjugationsLoading,
    refetch: refetchConjugations,
  } = api.conjugation.getForEntry.useQuery({ entryId: id });

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

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrorCodes(code as "NOT_FOUND") : message;
  };

  const deleteMutation = api.entry.delete.useMutation({
    onSuccess: () => {
      toast({
        title: tToasts("verbDeleted"),
      });
      router.push("/vocabulary/verbs/list");
    },
    onError: (error) => {
      toast({
        title: tToasts("entryDeleteError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const upsertMutation = api.conjugation.upsertForms.useMutation({
    onSuccess: async () => {
      toast({ title: tConjugations("saved") });
      setSavingLang(null);
      await refetchConjugations();
    },
    onError: (error) => {
      setSavingLang(null);
      toast({
        title: tToasts("conjugationSaveError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const irregularMutation = api.conjugation.setIrregular.useMutation({
    onSuccess: async (data) => {
      toast({
        title: data.isIrregular
          ? tConjugations("markedIrregular")
          : tConjugations("unmarkedIrregular"),
      });
      await Promise.all([refetchConjugations(), refetch()]);
    },
    onError: (error) => {
      toast({
        title: tCommon("error"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const handleDelete = () => {
    if (confirm(tCommon("confirmDelete", { name: verb?.mainText ?? "" }))) {
      deleteMutation.mutate({ id });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!verb) {
    return (
      <div className="max-w-5xl">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t("notFoundVerb")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const conjugatableTranslations = verb.translations.filter((tr) =>
    (CONJUGATABLE_LANGS as readonly string[]).includes(tr.lang)
  );

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <Link href="/vocabulary/verbs/list">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("backToVerbs")}
          </Button>
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <h1 className="text-4xl font-bold">{verb.mainText}</h1>
              <Badge variant="outline">{tCategories("verb")}</Badge>
            </div>
            {verb.note && (
              <p className="text-muted-foreground">{verb.note}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Link href={`/entries/${verb.id}/edit`}>
              <Button variant="outline">
                <Pencil className="mr-2 h-4 w-4" />
                {tCommon("edit")}
              </Button>
            </Link>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {tCommon("delete")}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("translationsTitle")}</CardTitle>
            <CardDescription>{t("translationsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="cahier-section grid gap-3">
              {verb.translations.map((translation) => {
                const lang = TARGET_LANGS.find(
                  (l) => l.code === translation.lang
                );
                return (
                  <div key={translation.id} className="cahier-item p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-2xl">{lang?.flag}</span>
                      <span className="font-semibold">
                        {tLang(
                          translation.lang
                        )}
                      </span>
                      {translation.isIrregular && (
                        <Badge variant="secondary">{tCommon("irregular")}</Badge>
                      )}
                    </div>
                    <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-lg font-medium">{translation.text}</p>
                      {translation.ipa ? (
                        <div className="ml-auto shrink-0 text-right">
                          <ClickableIpa
                            ipa={translation.ipa}
                            items={guideItemsByLang[translation.lang] ?? []}
                            className="m-0 text-base italic tracking-wide text-foreground/80"
                            showFullListButton={false}
                            targetLangName={tLang(translation.lang)}
                          />
                        </div>
                      ) : null}
                    </div>
                    {translation.example && (
                      <p className="text-sm text-muted-foreground">
                        {tEntries("examplePrefix")} {translation.example}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {conjugatableTranslations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t("conjugationsTitle")}</CardTitle>
              <CardDescription>{t("conjugationsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {conjugationsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Tabs defaultValue={conjugatableTranslations[0]?.lang}>
                  <TabsList
                    className="grid w-full"
                    style={{
                      gridTemplateColumns: `repeat(${conjugatableTranslations.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {conjugatableTranslations.map((tr) => {
                      const lang = TARGET_LANGS.find((l) => l.code === tr.lang);
                      return (
                        <TabsTrigger key={tr.lang} value={tr.lang}>
                          {lang?.flag}{" "}
                          {tLang(tr.lang)}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                  {conjugatableTranslations.map((tr) => {
                    const lang = TARGET_LANGS.find((l) => l.code === tr.lang);
                    const langData = conjugationData?.languages.find(
                      (l) => l.lang === tr.lang
                    );

                    if (!langData) {
                      return (
                        <TabsContent key={tr.lang} value={tr.lang}>
                          <p className="text-sm text-muted-foreground">
                            {t("noCatalogForLanguage")}
                          </p>
                        </TabsContent>
                      );
                    }

                    return (
                      <TabsContent key={tr.lang} value={tr.lang}>
                        <ConjugationTable
                          language={tr.lang}
                          languageName={tLang(
                            tr.lang
                          )}
                          flag={lang?.flag ?? ""}
                          profile={langData.profile}
                          forms={langData.forms}
                          isIrregular={langData.isIrregular}
                          editable
                          isSaving={
                            savingLang === tr.lang && upsertMutation.isPending
                          }
                          isTogglingIrregular={
                            irregularMutation.isPending &&
                            irregularMutation.variables?.translationId ===
                              langData.translationId
                          }
                          onIrregularChange={(isIrregular) => {
                            irregularMutation.mutate({
                              translationId: langData.translationId,
                              isIrregular,
                            });
                          }}
                          onSave={(nextForms) => {
                            setSavingLang(tr.lang);
                            upsertMutation.mutate({
                              translationId: langData.translationId,
                              forms: nextForms,
                            });
                          }}
                        />
                      </TabsContent>
                    );
                  })}
                </Tabs>
              )}
            </CardContent>
          </Card>
        )}

        <DomainAssignment
          entryId={verb.id}
          currentDomainIds={(verb.domains ?? []).map((d) => d.domainId)}
          onUpdate={() => void refetch()}
        />
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Progress } from "~/components/ui/progress";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";
import { SOURCE_LANG, TARGET_LANGS, TARGET_LANG_CODES } from "~/lib/languages";
import { CONJUGATABLE_LANGS } from "~/lib/conjugation-catalog";
import { Checkbox } from "~/components/ui/checkbox";
import { ArrowLeft, Sparkles, Plus, Loader2, BookOpen } from "lucide-react";

const conjugatableTargetLangs = TARGET_LANGS.filter((l) =>
  (CONJUGATABLE_LANGS as readonly string[]).includes(l.code),
);

export default function VerbsPage() {
  const t = useTranslations("vocabularyAdd");
  const tLang = useTranslations("languages");
  const sourceLanguageName = tLang(SOURCE_LANG.code);
  const tCommon = useTranslations("common");
  const tCategories = useTranslations("categories");
  const tToasts = useTranslations("toasts");
  const tDomainSuggestions = useTranslations("domainSuggestions");
  const tErrors = useTranslations("errors");
  const tErrorCodes = useTranslations("errors.codes");
  const router = useRouter();
  const { toast } = useToast();

  const [maxCount, setMaxCount] = useState<string>("");
  const [onlyIrregular, setOnlyIrregular] = useState(false);
  const [irregularTargetLang, setIrregularTargetLang] = useState<string>(
    conjugatableTargetLangs[0]?.code ?? "en",
  );
  const [suggestions, setSuggestions] = useState<
    Array<{
      text: string;
      note?: string;
      selected: boolean;
    }>
  >([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addingProgress, setAddingProgress] = useState({ current: 0, total: 0 });
  /** Remembers irregular focus target for the current suggestion batch */
  const [suggestionsIrregularTarget, setSuggestionsIrregularTarget] = useState<
    string | null
  >(null);

  const irregularTargetName = tLang(irregularTargetLang);
  const suggestionsTargetName = suggestionsIrregularTarget
    ? tLang(suggestionsIrregularTarget)
    : null;

  const { data: existingVerbs } = api.entry.list.useQuery({
    limit: 100,
  });

  const existingVerbCount =
    existingVerbs?.entries.filter((e) => e.category === "VERB").length ?? 0;

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrorCodes(code as "NOT_FOUND") : message;
  };

  const generateMutation = api.assist.generateCategorySuggestions.useMutation({
    onSuccess: (data) => {
      setSuggestions(
        data.suggestions.map((s) => ({
          ...s,
          selected: false,
        })),
      );
      setSuggestionsIrregularTarget(
        onlyIrregular ? irregularTargetLang : null,
      );
      setIsGenerating(false);
      toast({
        title: tToasts("suggestionsGenerated"),
        description: onlyIrregular
          ? tToasts("irregularVerbsFound", {
              count: data.suggestions.length,
            })
          : tToasts("verbsFound", { count: data.suggestions.length }),
      });
    },
    onError: (error) => {
      setIsGenerating(false);
      toast({
        title: tToasts("generateError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const createEntryMutation = api.entry.createManual.useMutation();
  const generateTranslationsMutation =
    api.assist.generateTranslations.useMutation();

  const handleGenerate = () => {
    setIsGenerating(true);
    const max = maxCount ? parseInt(maxCount) : undefined;

    generateMutation.mutate({
      category: "VERB",
      maxCount: max,
      onlyIrregular: onlyIrregular || undefined,
      irregularTargetLang: onlyIrregular ? irregularTargetLang : undefined,
    });
  };

  const handleToggleAll = () => {
    const allSelected = suggestions.every((s) => s.selected);
    setSuggestions(suggestions.map((s) => ({ ...s, selected: !allSelected })));
  };

  const handleToggle = (index: number) => {
    setSuggestions(
      suggestions.map((s, i) =>
        i === index ? { ...s, selected: !s.selected } : s
      )
    );
  };

  const handleAddSelected = async () => {
    const selected = suggestions.filter((s) => s.selected);
    if (selected.length === 0) {
      toast({
        title: tToasts("noSelection"),
        description: tToasts("selectAtLeastOneVerb"),
        variant: "destructive",
      });
      return;
    }

    setIsAdding(true);
    setAddingProgress({ current: 0, total: selected.length });

    try {
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < selected.length; i++) {
        const suggestion = selected[i];
        if (!suggestion) continue;
        try {
          const translations = await generateTranslationsMutation.mutateAsync({
            mainText: suggestion.text,
            note: suggestion.note,
            targetLangs: [...TARGET_LANG_CODES],
            category: "VERB",
          });

          const translationsList = Object.entries(translations).map(
            ([lang, tr]) => {
              const fromAi = tr.isIrregular === true;
              const forceFocus =
                suggestionsIrregularTarget !== null &&
                lang === suggestionsIrregularTarget;
              return {
                lang,
                text: tr.text,
                example: tr.example,
                regionTag: tr.regionTag,
                variants: tr.variants,
                conjugations: tr.conjugations,
                isIrregular: forceFocus || fromAi ? true : undefined,
              };
            },
          );

          await createEntryMutation.mutateAsync({
            type: "WORD",
            category: "VERB",
            mainLang: SOURCE_LANG.code,
            mainText: suggestion.text,
            note: suggestion.note,
            translations: translationsList,
          });

          successCount++;
          setAddingProgress({ current: i + 1, total: selected.length });
        } catch (error) {
          console.error(`Error adding ${suggestion.text}:`, error);
          errorCount++;
          setAddingProgress({ current: i + 1, total: selected.length });
        }
      }

      setIsAdding(false);
      setAddingProgress({ current: 0, total: 0 });

      if (successCount > 0) {
        toast({
          title: tToasts("verbsAdded"),
          description: tToasts("verbsAddedPartial", {
            success: successCount,
            failed: errorCount,
          }),
        });

        setSuggestions(suggestions.filter((s) => !s.selected));

        if (suggestions.filter((s) => !s.selected).length === 0) {
          setTimeout(() => {
            router.push("/vocabulary/verbs/list");
          }, 1500);
        }
      } else {
        toast({
          title: tCommon("error"),
          description: tToasts("verbsAddFailed"),
          variant: "destructive",
        });
      }
    } catch {
      setIsAdding(false);
      toast({
        title: tCommon("error"),
        description: tErrors("unexpected"),
        variant: "destructive",
      });
    }
  };

  const selectedCount = suggestions.filter((s) => s.selected).length;

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <Link href="/domains">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tCommon("back")}
          </Button>
        </Link>
        <h1 className="mb-2 text-4xl font-bold">{t("verbsTitle")}</h1>
        <p className="text-muted-foreground">{t("verbsSubtitle", { language: sourceLanguageName })}</p>
        {existingVerbCount > 0 && (
          <div className="mt-4">
            <Badge variant="secondary" className="text-sm">
              <BookOpen className="mr-1 h-3 w-3" />
              {t("verbsExisting", { count: existingVerbCount })}
            </Badge>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-5xl space-y-8">
        {suggestions.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {t("verbsGenerateTitle")}
              </CardTitle>
              <CardDescription>
                {onlyIrregular
                  ? t("verbsGenerateDescIrregular", {
                      targetLanguage: irregularTargetName,
                    })
                  : t("verbsGenerateDesc", { language: sourceLanguageName })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-xs">
                <Label htmlFor="max-count">{t("maxCountLabel")}</Label>
                <Input
                  id="max-count"
                  type="number"
                  min="5"
                  max="100"
                  placeholder={t("maxCountPlaceholder")}
                  value={maxCount}
                  onChange={(e) => setMaxCount(e.target.value)}
                  disabled={isGenerating}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("maxCountHint")}
                </p>
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="only-irregular-verbs"
                    checked={onlyIrregular}
                    onCheckedChange={(checked) =>
                      setOnlyIrregular(checked === true)
                    }
                    disabled={isGenerating}
                  />
                  <div className="space-y-1">
                    <Label
                      htmlFor="only-irregular-verbs"
                      className="cursor-pointer font-medium"
                    >
                      {t("onlyIrregularLabel")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t("onlyIrregularHint")}
                    </p>
                  </div>
                </div>

                {onlyIrregular && conjugatableTargetLangs.length > 0 && (
                  <div className="space-y-2 pl-7">
                    <Label className="text-sm font-medium">
                      {t("irregularTargetLabel")}
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {conjugatableTargetLangs.map((lang) => (
                        <Button
                          key={lang.code}
                          type="button"
                          size="sm"
                          variant={
                            irregularTargetLang === lang.code
                              ? "default"
                              : "outline"
                          }
                          onClick={() => setIrregularTargetLang(lang.code)}
                          disabled={isGenerating}
                        >
                          {lang.flag} {tLang(lang.code)}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Button
                onClick={handleGenerate}
                disabled={
                  isGenerating ||
                  (onlyIrregular && conjugatableTargetLangs.length === 0)
                }
                size="lg"
                className="w-full sm:w-auto"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    {tCommon("generating")}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    {tCommon("generate")}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {isAdding && addingProgress.total > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{t("verbsAdding")}</span>
                      <span className="text-muted-foreground">
                        {tCommon("progress", {
                          current: addingProgress.current,
                          total: addingProgress.total,
                        })}
                      </span>
                    </div>
                    <Progress
                      value={
                        (addingProgress.current / addingProgress.total) * 100
                      }
                      className="h-2"
                    />
                    <p className="text-xs text-muted-foreground">
                      {tCommon("generatingTranslationsAndConjugations")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      {selectedCount > 0
                        ? t("suggestionsCountSelected", {
                            count: suggestions.length,
                            selected: selectedCount,
                          })
                        : t("suggestionsCount", { count: suggestions.length })}
                    </CardTitle>
                    <CardDescription>{t("verbsSelectDesc")}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleToggleAll}
                      disabled={isAdding}
                    >
                      {suggestions.every((s) => s.selected)
                        ? tCommon("deselectAll")
                        : tCommon("selectAll")}
                    </Button>
                    <Button
                      onClick={handleAddSelected}
                      disabled={selectedCount === 0 || isAdding}
                      size="lg"
                    >
                      {isAdding ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {tCommon("adding")}
                        </>
                      ) : (
                        <>
                          <Plus className="mr-2 h-4 w-4" />
                          {tDomainSuggestions("addSelected", {
                            count: selectedCount,
                          })}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors ${
                        suggestion.selected
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => handleToggle(index)}
                    >
                      <input
                        type="checkbox"
                        checked={suggestion.selected}
                        onChange={() => handleToggle(index)}
                        className="h-4 w-4 cursor-pointer"
                        disabled={isAdding}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-medium">
                            {suggestion.text}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {tCategories("verb")}
                          </Badge>
                          {suggestionsTargetName && (
                            <Badge variant="secondary" className="text-xs">
                              {tCommon("irregular")} · {suggestionsTargetName}
                            </Badge>
                          )}
                        </div>
                        {suggestion.note && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {suggestion.note}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={() => {
                  setSuggestions([]);
                  setSuggestionsIrregularTarget(null);
                }}
                disabled={isAdding}
              >
                {tDomainSuggestions("regenerate")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

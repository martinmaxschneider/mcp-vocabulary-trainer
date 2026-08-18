"use client";

import { use, useState } from "react";
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
import { ArrowLeft, Sparkles, Plus, Loader2 } from "lucide-react";
import { resolveErrorCode } from "~/lib/trpc-error";
import { SOURCE_LANG, TARGET_LANG_CODES } from "~/lib/languages";
import { isEntryCreated } from "~/lib/entry-create";

export default function DomainSuggestionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: domainId } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("domainSuggestions");
  const tDomains = useTranslations("domains");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const tErrorsPage = useTranslations("errors");
  const tCategories = useTranslations("categories");

  const [maxCount, setMaxCount] = useState<string>("");
  const [suggestions, setSuggestions] = useState<
    Array<{
      text: string;
      type: "WORD" | "PROVERB";
      category:
        | "VERB"
        | "NOUN"
        | "ADJECTIVE"
        | "PROVERB"
        | "ADVERB"
        | "PREPOSITION"
        | "CONJUNCTION"
        | "PRONOUN"
        | "OTHER";
      note?: string;
      selected: boolean;
    }>
  >([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addingProgress, setAddingProgress] = useState({ current: 0, total: 0 });

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrors(code as "NOT_FOUND") : message;
  };

  const { data: domains } = api.domain.list.useQuery();
  const domain = domains?.find((d) => d.id === domainId);

  const generateMutation = api.assist.generateVocabSuggestions.useMutation({
    onSuccess: (data) => {
      setSuggestions(
        data.suggestions.map((s) => ({
          ...s,
          selected: false,
        }))
      );
      setIsGenerating(false);
      toast({
        title: tToasts("suggestionsGenerated"),
        description: tToasts("suggestionsFound", {
          count: data.suggestions.length,
        }),
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
    if (!domain) return;

    setIsGenerating(true);
    const max = maxCount ? parseInt(maxCount) : undefined;

    generateMutation.mutate({
      domainName: domain.name,
      maxCount: max,
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
        description: tToasts("selectAtLeastOneWord"),
        variant: "destructive",
      });
      return;
    }

    setIsAdding(true);
    setAddingProgress({ current: 0, total: selected.length });

    try {
      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < selected.length; i++) {
        const suggestion = selected[i];
        if (!suggestion) continue;
        try {
          const translations = await generateTranslationsMutation.mutateAsync({
            mainText: suggestion.text,
            note: suggestion.note,
            targetLangs: [...TARGET_LANG_CODES],
            category: suggestion.category,
          });

          const translationsList = Object.entries(translations).map(
            ([lang, tr]) => ({
              lang,
              text: tr.text,
              example: tr.example,
              regionTag: tr.regionTag,
              variants: tr.variants,
              ipa: tr.ipa ?? undefined,
              conjugations: tr.conjugations,
            })
          );

          const created = await createEntryMutation.mutateAsync({
            type: suggestion.type,
            category: suggestion.category,
            mainLang: SOURCE_LANG.code,
            mainText: suggestion.text,
            note: suggestion.note,
            domainId,
            translations: translationsList,
          });

          if (!isEntryCreated(created)) {
            skippedCount++;
          } else {
            successCount++;
          }
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
          title: tToasts("vocabAdded"),
          description: tToasts("vocabAddedPartial", {
            success: successCount,
            failed: errorCount,
            skipped: skippedCount,
          }),
        });

        setSuggestions(suggestions.filter((s) => !s.selected));

        if (suggestions.filter((s) => !s.selected).length === 0) {
          router.push(`/domains/${domainId}`);
        }
      } else {
        toast({
          title: tCommon("error"),
          description:
            skippedCount > 0
              ? tToasts("similarBatchSkipped", { count: skippedCount })
              : tToasts("vocabAddFailed"),
          variant: "destructive",
        });
      }
    } catch {
      setIsAdding(false);
      toast({
        title: tCommon("error"),
        description: tErrorsPage("unexpected"),
        variant: "destructive",
      });
    }
  };

  const selectedCount = suggestions.filter((s) => s.selected).length;

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <Link href={`/domains/${domainId}`}>
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tDomains("backToDomain")}
          </Button>
        </Link>
        <h1 className="text-4xl font-bold mb-2">
          {t("title", { domainName: domain?.name ?? "" })}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {suggestions.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {t("generateTitle")}
            </CardTitle>
            <CardDescription>{t("generateDesc")}</CardDescription>
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
              <p className="text-xs text-muted-foreground mt-1">
                {t("maxCountHint")}
              </p>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
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
                    <span className="font-medium">{t("addingVocab")}</span>
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
                    {tCommon("generatingTranslations")}
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
                      ? t("suggestionsTitleSelected", {
                          count: suggestions.length,
                          selected: selectedCount,
                        })
                      : t("suggestionsTitle", { count: suggestions.length })}
                  </CardTitle>
                  <CardDescription>{t("suggestionsDesc")}</CardDescription>
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
                        {t("addSelected", { count: selectedCount })}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="cahier-section grid gap-3">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    className={`cahier-item flex cursor-pointer items-center gap-3 p-4 ${
                      suggestion.selected
                        ? "cahier-item-selected"
                        : "cahier-item-hover"
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
                        <span className="font-medium text-lg">
                          {suggestion.text}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {tCategories(
                            suggestion.category.toLowerCase() as
                              | "verb"
                              | "noun"
                              | "adjective"
                              | "proverb"
                              | "adverb"
                              | "preposition"
                              | "conjunction"
                              | "pronoun"
                              | "other",
                          )}
                        </Badge>
                      </div>
                      {suggestion.note && (
                        <p className="text-sm text-muted-foreground mt-1">
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
              onClick={() => setSuggestions([])}
              disabled={isAdding}
            >
              {t("regenerate")}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/domains/${domainId}`)}
              disabled={isAdding}
            >
              {t("done")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

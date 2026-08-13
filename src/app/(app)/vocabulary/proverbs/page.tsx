"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Badge } from "~/components/ui/badge";
import { Progress } from "~/components/ui/progress";
import { api } from "~/trpc/client";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";
import { SOURCE_LANG, TARGET_LANG_CODES } from "~/lib/languages";
import { ManualVocabularyAddCard } from "~/components/manual-vocabulary-add-card";

interface ProverbSuggestion {
  text: string;
  note?: string;
  selected: boolean;
}

export default function AddProverbsPage() {
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
  const [suggestions, setSuggestions] = useState<ProverbSuggestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addingProgress, setAddingProgress] = useState({ current: 0, total: 0 });

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrorCodes(code as "NOT_FOUND") : message;
  };

  const generateSuggestions = api.assist.generateCategorySuggestions.useMutation({
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
        description: tToasts("proverbsFound", { count: data.suggestions.length }),
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
  const generateTranslationsMutation = api.assist.generateTranslations.useMutation();

  const handleGenerate = () => {
    setIsGenerating(true);
    generateSuggestions.mutate({ category: "PROVERB" });
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
        description: tToasts("selectAtLeastOneProverb"),
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
        try {
          const translations = await generateTranslationsMutation.mutateAsync({
            mainText: suggestion.text,
            note: suggestion.note,
            targetLangs: [...TARGET_LANG_CODES],
            category: "PROVERB",
          });

          const translationsList = Object.entries(translations).map(
            ([lang, tr]) => ({
              lang,
              text: tr.text,
              example: tr.example,
              regionTag: tr.regionTag,
              variants: tr.variants,
              ipa: tr.ipa ?? undefined,
            })
          );

          await createEntryMutation.mutateAsync({
            type: "PROVERB",
            category: "PROVERB",
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
        }
      }

      setIsAdding(false);

      if (successCount > 0) {
        toast({
          title: tToasts("proverbsAdded"),
          description: tToasts("proverbsAddedPartial", {
            success: successCount,
            failed: errorCount,
          }),
        });

        setTimeout(() => {
          router.push("/vocabulary/proverbs/list");
        }, 1500);
      } else {
        toast({
          title: tCommon("error"),
          description: tToasts("proverbsAddFailed"),
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
            {t("proverbsBack")}
          </Button>
        </Link>
        <div className="mb-2 flex items-center gap-3">
          <Sparkles className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-bold">{t("proverbsTitle")}</h1>
        </div>
        <p className="text-lg text-muted-foreground">{t("proverbsSubtitle", { language: sourceLanguageName })}</p>
      </div>

      {suggestions.length === 0 ? (
        <div className="space-y-8">
          <ManualVocabularyAddCard
            category="PROVERB"
            listHref="/vocabulary/proverbs/list"
          />
          <Card>
            <CardHeader>
              <CardTitle>{t("proverbsGenerateTitle")}</CardTitle>
              <CardDescription>{t("proverbsGenerateDesc", { language: sourceLanguageName })}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleGenerate} disabled={isGenerating} size="lg">
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
        </div>
      ) : (
        <>
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {t("suggestionsCount", { count: suggestions.length })}
                </CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleToggleAll}>
                    {suggestions.every((s) => s.selected)
                      ? tCommon("deselectAll")
                      : tCommon("selectAll")}
                  </Button>
                  <Button
                    onClick={handleAddSelected}
                    disabled={selectedCount === 0 || isAdding}
                    size="sm"
                  >
                    {isAdding ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {tDomainSuggestions("addSelected", {
                          count: selectedCount,
                        })}
                      </>
                    ) : (
                      tDomainSuggestions("addSelected", { count: selectedCount })
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t("proverbsSelectDesc")}
              </p>

              {isAdding && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {t("proverbsAdding", {
                        current: addingProgress.current,
                        total: addingProgress.total,
                      })}
                    </span>
                    <span className="text-sm font-medium">
                      {Math.round(
                        (addingProgress.current / addingProgress.total) * 100
                      )}
                      %
                    </span>
                  </div>
                  <Progress
                    value={
                      (addingProgress.current / addingProgress.total) * 100
                    }
                    className="h-2"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="cahier-section space-y-3">
            {suggestions.map((proverb, index) => (
              <Card
                key={index}
                className={`cahier-item cursor-pointer ${
                  proverb.selected ? "cahier-item-selected" : "cahier-item-hover"
                }`}
                onClick={() => handleToggle(index)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={proverb.selected}
                      onCheckedChange={() => handleToggle(index)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="mb-1 text-lg font-medium">
                            {proverb.text}
                          </div>
                          {proverb.note && (
                            <div className="text-sm text-muted-foreground">
                              {proverb.note}
                            </div>
                          )}
                        </div>
                        <Badge variant="secondary">
                          {tCategories("proverb")}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-6 flex justify-between">
            <Button
              variant="outline"
              onClick={handleGenerate}
              disabled={isGenerating || isAdding}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {tDomainSuggestions("regenerate")}
            </Button>
            <Button
              onClick={handleAddSelected}
              disabled={selectedCount === 0 || isAdding}
            >
              {isAdding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tDomainSuggestions("addSelected", { count: selectedCount })}
                </>
              ) : (
                tDomainSuggestions("addSelected", { count: selectedCount })
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { WordCategory } from "@prisma/client";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";
import { SOURCE_LANG, TARGET_LANGS } from "~/lib/languages";
import { isConjugatableLang } from "~/lib/conjugation-catalog";
import { isEntryCreated } from "~/lib/entry-create";
import type { z } from "zod";
import type { conjugationsSchema } from "~/lib/schemas/translation";
import { Plus, Save, Sparkles, Loader2 } from "lucide-react";
import {
  SimilarEntriesDialog,
  type SimilarEntryCandidate,
} from "~/components/similar-entries-dialog";

type Conjugations = z.infer<typeof conjugationsSchema>;

type TranslationDraft = {
  text: string;
  example?: string;
  regionTag?: string;
  variants?: string[];
  ipa?: string;
  isIrregular?: boolean;
  conjugations?: Conjugations;
};

const CATEGORY_LABEL_KEY: Record<
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

function emptyTranslations(): Record<string, TranslationDraft> {
  return Object.fromEntries(
    TARGET_LANGS.map((lang) => [
      lang.code,
      lang.code === "gsw"
        ? { text: "", example: "", regionTag: "", variants: [] as string[] }
        : { text: "", example: "" },
    ]),
  );
}

type ManualVocabularyAddCardProps = {
  category: WordCategory;
  listHref: string;
};

function ManualVocabularyAddCardInner({
  category,
  listHref,
}: ManualVocabularyAddCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const t = useTranslations("vocabularyAdd");
  const tEntries = useTranslations("entries");
  const tConjugations = useTranslations("conjugations");
  const tCategories = useTranslations("categories");
  const tLang = useTranslations("languages");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const isVerb = category === "VERB";

  const categoryName = tCategories(CATEGORY_LABEL_KEY[category]);
  const sourceLanguageName = tLang(SOURCE_LANG.code);

  const [mainText, setMainText] = useState("");
  const [note, setNote] = useState("");
  const [domainId, setDomainId] = useState(
    searchParams.get("domainId") ?? "none",
  );
  const [translations, setTranslations] =
    useState<Record<string, TranslationDraft>>(emptyTranslations);
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarCandidates, setSimilarCandidates] = useState<
    SimilarEntryCandidate[]
  >([]);
  const [pendingCreate, setPendingCreate] = useState<{
    type: "WORD" | "PROVERB";
    category: WordCategory;
    mainLang: string;
    mainText: string;
    note?: string;
    domainId?: string;
    translations: Array<{
      lang: string;
      text: string;
      example?: string;
      regionTag?: string;
      variants?: string[];
      ipa?: string;
      isIrregular?: boolean;
      conjugations?: Conjugations;
    }>;
  } | null>(null);

  const { data: domains } = api.domain.list.useQuery();

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrors(code as "NOT_FOUND") : message;
  };

  const generateMutation = api.assist.generateTranslations.useMutation({
    onSuccess: (data) => {
      toast({ title: tToasts("translationsGenerated") });
      setTranslations((prev) => {
        const next = { ...prev };
        for (const [lang, translation] of Object.entries(data)) {
          next[lang] = {
            text: translation.text ?? "",
            example: translation.example ?? "",
            regionTag: translation.regionTag ?? "",
            variants: translation.variants ?? [],
            ipa: translation.ipa ?? undefined,
            isIrregular: translation.isIrregular,
            conjugations: translation.conjugations,
          };
        }
        return next;
      });
    },
    onError: (error) => {
      toast({
        title: tToasts("translationsGenerateError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const createMutation = api.entry.createManual.useMutation({
    onSuccess: (result) => {
      if (!isEntryCreated(result)) {
        setSimilarCandidates(result.candidates);
        setSimilarOpen(true);
        return;
      }
      setSimilarOpen(false);
      toast({ title: tToasts("entryCreated") });
      if (domainId && domainId !== "none") {
        router.push(`/domains/${domainId}`);
      } else {
        router.push(listHref);
      }
    },
    onError: (error) => {
      toast({
        title: tToasts("entryCreateError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const handleGenerateTranslations = () => {
    if (!mainText.trim()) {
      toast({
        title: tEntries("validationMainText"),
        variant: "destructive",
      });
      return;
    }

    generateMutation.mutate({
      mainText: mainText.trim(),
      note: note.trim() || undefined,
      targetLangs: TARGET_LANGS.map((l) => l.code),
      category,
    });
  };

  const updateTranslation = (
    lang: string,
    patch: Partial<TranslationDraft>,
  ) => {
    setTranslations((prev) => ({
      ...prev,
      [lang]: {
        ...prev[lang],
        text: prev[lang]?.text ?? "",
        ...patch,
      },
    }));
  };

  const handleSave = () => {
    if (!mainText.trim()) {
      toast({
        title: tEntries("validationMainTextRequired"),
        variant: "destructive",
      });
      return;
    }

    const translationsList = Object.entries(translations)
      .filter(([, tr]) => tr.text.trim())
      .map(([lang, tr]) => ({
        lang,
        text: tr.text.trim(),
        example: tr.example?.trim() || undefined,
        regionTag: tr.regionTag?.trim() || undefined,
        variants: tr.variants?.filter((v) => v.trim()) || undefined,
        ipa: tr.ipa?.trim() || undefined,
        isIrregular: isVerb ? tr.isIrregular === true : undefined,
        conjugations: tr.conjugations,
      }));

    if (translationsList.length === 0) {
      toast({
        title: tEntries("validationTranslationRequired"),
        variant: "destructive",
      });
      return;
    }

    const payload = {
      type: (category === "PROVERB" ? "PROVERB" : "WORD") as "WORD" | "PROVERB",
      category,
      mainLang: SOURCE_LANG.code,
      mainText: mainText.trim(),
      note: note.trim() || undefined,
      domainId: domainId === "none" ? undefined : domainId,
      translations: translationsList,
    };
    setPendingCreate(payload);
    createMutation.mutate(payload);
  };

  const handleConfirmSimilar = () => {
    if (!pendingCreate) return;
    createMutation.mutate({ ...pendingCreate, allowSimilar: true });
  };

  const busy = generateMutation.isPending || createMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5 text-primary" />
          {t("manualAddTitle", { category: categoryName })}
        </CardTitle>
        <CardDescription>
          {t("manualAddDesc", {
            category: categoryName,
            language: sourceLanguageName,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="max-w-md">
            <Label htmlFor="manual-domain">{tEntries("domainLabel")}</Label>
            <Select
              value={domainId}
              onValueChange={setDomainId}
              disabled={busy}
            >
              <SelectTrigger id="manual-domain">
                <SelectValue placeholder={tEntries("domainPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{tCommon("none")}</SelectItem>
                {domains?.map((domain) => (
                  <SelectItem key={domain.id} value={domain.id}>
                    {domain.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="manual-mainText">
              {tEntries("sourceTextLabel", { language: sourceLanguageName })}
            </Label>
            <Input
              id="manual-mainText"
              placeholder={tEntries("sourceTextPlaceholder", {
                language: sourceLanguageName,
              })}
              value={mainText}
              onChange={(e) => setMainText(e.target.value)}
              disabled={busy}
            />
          </div>

          <div>
            <Label htmlFor="manual-note">{tEntries("noteLabel")}</Label>
            <Input
              id="manual-note"
              placeholder={tEntries("notePlaceholder")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-medium">{tEntries("translationsTitle")}</h3>
              <p className="text-sm text-muted-foreground">
                {tEntries("translationsCreateDesc")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleGenerateTranslations}
              disabled={busy || !mainText.trim()}
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tEntries("generatingWithAi")}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {tEntries("generateWithAi")}
                </>
              )}
            </Button>
          </div>

          <div className="cahier-section space-y-3">
            {TARGET_LANGS.map((lang) => {
              const languageName = tLang(lang.code);
              const draft = translations[lang.code];
              return (
                <div
                  key={lang.code}
                  className="cahier-item space-y-3 p-4"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{lang.code.toUpperCase()}</Badge>
                    <span className="font-medium">{languageName}</span>
                    {lang.flag}
                  </div>
                  <div className="space-y-2">
                    <div>
                      <Label htmlFor={`manual-${lang.code}-text`}>
                        {tEntries("translationLabel")}
                      </Label>
                      <Input
                        id={`manual-${lang.code}-text`}
                        placeholder={tEntries("translationPlaceholder", {
                          language: languageName,
                        })}
                        value={draft?.text ?? ""}
                        onChange={(e) =>
                          updateTranslation(lang.code, { text: e.target.value })
                        }
                        disabled={busy}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`manual-${lang.code}-example`}>
                        {tEntries("exampleLabel")}
                      </Label>
                      <Input
                        id={`manual-${lang.code}-example`}
                        placeholder={tEntries("examplePlaceholder")}
                        value={draft?.example ?? ""}
                        onChange={(e) =>
                          updateTranslation(lang.code, {
                            example: e.target.value,
                          })
                        }
                        disabled={busy}
                      />
                    </div>
                    {lang.code === "gsw" && (
                      <div>
                        <Label htmlFor="manual-gsw-region">
                          {tEntries("regionLabel")}
                        </Label>
                        <Input
                          id="manual-gsw-region"
                          placeholder={tEntries("regionPlaceholder")}
                          value={draft?.regionTag ?? ""}
                          onChange={(e) =>
                            updateTranslation("gsw", {
                              regionTag: e.target.value,
                            })
                          }
                          disabled={busy}
                        />
                      </div>
                    )}
                    {isVerb && isConjugatableLang(lang.code) && (
                      <div className="flex items-center gap-2 pt-1">
                        <Checkbox
                          id={`manual-${lang.code}-irregular`}
                          checked={draft?.isIrregular === true}
                          onCheckedChange={(checked) =>
                            updateTranslation(lang.code, {
                              isIrregular: checked === true,
                            })
                          }
                          disabled={busy}
                        />
                        <Label
                          htmlFor={`manual-${lang.code}-irregular`}
                          className="cursor-pointer text-sm font-normal"
                        >
                          {tConjugations("irregularInLanguage")}
                        </Label>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Button
          type="button"
          size="lg"
          onClick={handleSave}
          disabled={busy}
          className="w-full sm:w-auto"
        >
          {createMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {tCommon("saving")}
            </>
          ) : (
            <>
              <Save className="mr-2 h-5 w-5" />
              {t("manualAddSave")}
            </>
          )}
        </Button>
      </CardContent>
      <SimilarEntriesDialog
        open={similarOpen}
        onOpenChange={setSimilarOpen}
        candidates={similarCandidates}
        confirming={createMutation.isPending}
        onConfirm={handleConfirmSimilar}
      />
    </Card>
  );
}

export function ManualVocabularyAddCard(props: ManualVocabularyAddCardProps) {
  const tCommon = useTranslations("common");
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">{tCommon("loading")}</div>}>
      <ManualVocabularyAddCardInner {...props} />
    </Suspense>
  );
}

"use client";

import { useState, Suspense } from "react";
import { SOURCE_LANG, TARGET_LANGS } from "~/lib/languages";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "~/trpc/client";

export const dynamic = "force-dynamic";
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
import { useToast } from "~/hooks/use-toast";
import { ArrowLeft, Sparkles, Save } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { resolveErrorCode } from "~/lib/trpc-error";

function NewEntryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const t = useTranslations("entries");
  const tCategories = useTranslations("categories");
  const tLang = useTranslations("languages");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");

  const [type, setType] = useState<"WORD" | "PROVERB">("WORD");
  const [mainText, setMainText] = useState("");
  const [note, setNote] = useState("");
  const [domainId, setDomainId] = useState(
    searchParams.get("domainId") ?? "none"
  );

  const [translations, setTranslations] = useState<
    Record<
      string,
      { text: string; example?: string; regionTag?: string; variants?: string[] }
    >
  >({
    en: { text: "", example: "" },
    es: { text: "", example: "" },
    fr: { text: "", example: "" },
    gsw: { text: "", example: "", regionTag: "", variants: [] },
  });

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrors(code as "NOT_FOUND") : message;
  };

  const { data: domains } = api.domain.list.useQuery();

  const generateMutation = api.assist.generateTranslations.useMutation({
    onSuccess: (data) => {
      toast({ title: tToasts("translationsGenerated") });
      const newTranslations = { ...translations };
      for (const [lang, translation] of Object.entries(data)) {
        newTranslations[lang] = {
          text: translation.text ?? "",
          example: translation.example ?? "",
          regionTag: translation.regionTag ?? "",
          variants: translation.variants ?? [],
        };
      }
      setTranslations(newTranslations);
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
    onSuccess: () => {
      toast({ title: tToasts("entryCreated") });
      if (domainId && domainId !== "none") {
        router.push(`/domains/${domainId}`);
      } else {
        router.push("/domains");
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
        title: t("validationMainText"),
        variant: "destructive",
      });
      return;
    }

    generateMutation.mutate({
      mainText: mainText.trim(),
      note: note.trim() || undefined,
      targetLangs: TARGET_LANGS.map((l) => l.code),
    });
  };

  const handleSave = () => {
    if (!mainText.trim()) {
      toast({
        title: t("validationMainTextRequired"),
        variant: "destructive",
      });
      return;
    }

    const translationsList = Object.entries(translations)
      .filter(([_, tr]) => tr.text.trim())
      .map(([lang, tr]) => ({
        lang,
        text: tr.text.trim(),
        example: tr.example?.trim() || undefined,
        regionTag: tr.regionTag?.trim() || undefined,
        variants: tr.variants?.filter((v) => v.trim()) || undefined,
      }));

    if (translationsList.length === 0) {
      toast({
        title: t("validationTranslationRequired"),
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      type,
      mainLang: SOURCE_LANG.code,
      mainText: mainText.trim(),
      note: note.trim() || undefined,
      domainId: domainId === "none" ? undefined : domainId,
      translations: translationsList,
    });
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <Link
          href={
            domainId && domainId !== "none"
              ? `/domains/${domainId}`
              : "/domains"
          }
        >
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tCommon("back")}
          </Button>
        </Link>
        <h1 className="text-4xl font-bold mb-2">{t("createTitle")}</h1>
        <p className="text-muted-foreground">{t("createSubtitle")}</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("basicInfo")}</CardTitle>
            <CardDescription>
              {t("basicInfoCreateDesc", { language: tLang(SOURCE_LANG.code) })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="type">{t("typeLabel")}</Label>
                <Select
                  value={type}
                  onValueChange={(value) =>
                    setType(value as "WORD" | "PROVERB")
                  }
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WORD">
                      {tCategories("entryTypeWord")}
                    </SelectItem>
                    <SelectItem value="PROVERB">
                      {tCategories("entryTypeProverb")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="domain">{t("domainLabel")}</Label>
                <Select value={domainId} onValueChange={setDomainId}>
                  <SelectTrigger id="domain">
                    <SelectValue placeholder={t("domainPlaceholder")} />
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
            </div>

            <div>
              <Label htmlFor="mainText">
                {t("sourceTextLabel", { language: tLang(SOURCE_LANG.code) })}
              </Label>
              <Input
                id="mainText"
                placeholder={t("sourceTextPlaceholder", {
                  language: tLang(SOURCE_LANG.code),
                })}
                value={mainText}
                onChange={(e) => setMainText(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="note">{t("noteLabel")}</Label>
              <Input
                id="note"
                placeholder={t("notePlaceholder")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t("translationsTitle")}</CardTitle>
                <CardDescription>{t("translationsCreateDesc")}</CardDescription>
              </div>
              <Button
                onClick={handleGenerateTranslations}
                disabled={generateMutation.isPending || !mainText.trim()}
                variant="outline"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {generateMutation.isPending
                  ? t("generatingWithAi")
                  : t("generateWithAi")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {TARGET_LANGS.map((lang) => {
              const languageName = tLang(
                lang.code
              );
              return (
                <div
                  key={lang.code}
                  className="space-y-3 p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {lang.code.toUpperCase()}
                    </Badge>
                    <span className="font-medium">{languageName}</span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <Label htmlFor={`${lang.code}-text`}>
                        {t("translationLabel")}
                      </Label>
                      <Input
                        id={`${lang.code}-text`}
                        placeholder={t("translationPlaceholder", {
                          language: languageName,
                        })}
                        value={translations[lang.code]?.text ?? ""}
                        onChange={(e) =>
                          setTranslations({
                            ...translations,
                            [lang.code]: {
                              ...translations[lang.code],
                              text: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${lang.code}-example`}>
                        {t("exampleLabel")}
                      </Label>
                      <Input
                        id={`${lang.code}-example`}
                        placeholder={t("examplePlaceholder")}
                        value={translations[lang.code]?.example ?? ""}
                        onChange={(e) =>
                          setTranslations({
                            ...translations,
                            [lang.code]: {
                              ...translations[lang.code],
                              example: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    {lang.code === "gsw" && (
                      <div>
                        <Label htmlFor="gsw-region">{t("regionLabel")}</Label>
                        <Input
                          id="gsw-region"
                          placeholder={t("regionPlaceholder")}
                          value={translations.gsw?.regionTag ?? ""}
                          onChange={(e) =>
                            setTranslations({
                              ...translations,
                              gsw: {
                                ...translations.gsw,
                                regionTag: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button
            onClick={handleSave}
            disabled={createMutation.isPending}
            size="lg"
            className="flex-1"
          >
            <Save className="mr-2 h-5 w-5" />
            {createMutation.isPending ? tCommon("saving") : t("saveEntry")}
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => router.back()}
            disabled={createMutation.isPending}
          >
            {tCommon("cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function NewEntryPage() {
  const tCommon = useTranslations("common");

  return (
    <Suspense fallback={<div>{tCommon("loading")}</div>}>
      <NewEntryPageContent />
    </Suspense>
  );
}

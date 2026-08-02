"use client";

import { use, useState, useEffect } from "react";
import { SOURCE_LANG, TARGET_LANGS } from "~/lib/languages";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useToast } from "~/hooks/use-toast";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { resolveErrorCode } from "~/lib/trpc-error";

export default function EditEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: entryId } = use(params);
  const router = useRouter();
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
  const [domainId, setDomainId] = useState("none");

  const [translations, setTranslations] = useState<
    Record<
      string,
      {
        id?: string;
        text: string;
        example?: string;
        regionTag?: string;
        variants?: string[];
      }
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
  const { data: entry, isLoading } = api.entry.getById.useQuery({
    id: entryId,
  });

  const updateMutation = api.entry.update.useMutation({
    onSuccess: () => {
      toast({ title: tToasts("entryUpdated") });
      if (domainId && domainId !== "none") {
        router.push(`/domains/${domainId}`);
      } else {
        router.push("/domains");
      }
    },
    onError: (error) => {
      toast({
        title: tToasts("entryUpdateError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (entry) {
      setType(entry.type);
      setMainText(entry.mainText);
      setNote(entry.note ?? "");
      setDomainId(entry.domains[0]?.domainId ?? "none");

      const loadedTranslations: typeof translations = {
        en: { text: "", example: "" },
        es: { text: "", example: "" },
        fr: { text: "", example: "" },
        gsw: { text: "", example: "", regionTag: "", variants: [] },
      };

      entry.translations.forEach((tr) => {
        loadedTranslations[tr.lang] = {
          id: tr.id,
          text: tr.text,
          example: tr.example ?? "",
          regionTag: tr.regionTag ?? "",
          variants: Array.isArray(tr.variants) ? (tr.variants as string[]) : [],
        };
      });

      setTranslations(loadedTranslations);
    }
  }, [entry]);

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
        id: tr.id,
        lang,
        text: tr.text.trim(),
        example: tr.example?.trim() || undefined,
        regionTag: tr.regionTag?.trim() || undefined,
        variants: tr.variants?.filter((v) => v.trim()) || undefined,
      }));

    updateMutation.mutate({
      id: entryId,
      mainText: mainText.trim(),
      note: note.trim() || undefined,
      domainId: domainId === "none" ? undefined : domainId,
      translationsUpsert: translationsList,
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

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
        <h1 className="text-4xl font-bold mb-2">{t("editTitle")}</h1>
        <p className="text-muted-foreground">{t("editSubtitle")}</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("basicInfo")}</CardTitle>
            <CardDescription>
              {t("basicInfoEditDesc", { language: tLang(SOURCE_LANG.code) })}
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
            <CardTitle>{t("translationsTitle")}</CardTitle>
            <CardDescription>{t("translationsEditDesc")}</CardDescription>
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
            disabled={updateMutation.isPending}
            size="lg"
            className="flex-1"
          >
            <Save className="mr-2 h-5 w-5" />
            {updateMutation.isPending ? tCommon("saving") : t("saveChanges")}
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => router.back()}
            disabled={updateMutation.isPending}
          >
            {tCommon("cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}

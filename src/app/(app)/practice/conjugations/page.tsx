"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { TARGET_LANGS } from "~/lib/languages";
import { CONJUGATABLE_LANGS, getConjugationProfile } from "~/lib/conjugation-catalog";
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
import { Input } from "~/components/ui/input";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";
import {
  ArrowLeft,
  CheckCircle2,
  Languages,
  Loader2,
  Play,
  XCircle,
} from "lucide-react";

type DrillState = "setup" | "active";

export default function ConjugationDrillPage() {
  const t = useTranslations("conjugations");
  const tCommon = useTranslations("common");
  const tReview = useTranslations("review");
  const tLang = useTranslations("languages");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const [drillState, setDrillState] = useState<DrillState>("setup");
  const [selectedLang, setSelectedLang] = useState<string>("es");
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [selectedTenses, setSelectedTenses] = useState<string[]>([]);
  const [onlyIrregular, setOnlyIrregular] = useState(false);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<{
    isCorrect: boolean;
    expected: string;
    typo: boolean;
  } | null>(null);
  const [cardKey, setCardKey] = useState(0);

  const { data: domains } = api.domain.list.useQuery();
  const profile = getConjugationProfile(selectedLang);

  const tenseKeys = useMemo(() => {
    if (selectedTenses.length > 0) return selectedTenses;
    return undefined;
  }, [selectedTenses]);

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrors(code as "NOT_FOUND") : message;
  };

  const {
    data: drillData,
    isLoading,
    isFetching,
    refetch,
  } = api.conjugation.getDrillCard.useQuery(
    {
      targetLang: selectedLang,
      domainIds: selectedDomains.length > 0 ? selectedDomains : undefined,
      tenseKeys,
      onlyIrregular: onlyIrregular || undefined,
    },
    {
      enabled: drillState === "active",
      refetchOnWindowFocus: false,
    }
  );

  const submitMutation = api.conjugation.submitDrillAnswer.useMutation({
    onSuccess: (data) => {
      setResult({
        isCorrect: data.isCorrect,
        expected: data.expected,
        typo: data.typo,
      });
    },
    onError: (error) => {
      toast({
        title: tCommon("error"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const conjugatableLangs = TARGET_LANGS.filter((l) =>
    (CONJUGATABLE_LANGS as readonly string[]).includes(l.code)
  );

  const startDrill = () => {
    setResult(null);
    setAnswer("");
    setCardKey((k) => k + 1);
    setDrillState("active");
  };

  const nextCard = async () => {
    setResult(null);
    setAnswer("");
    setCardKey((k) => k + 1);
    await refetch();
  };

  const card = drillData?.card;
  const totalAvailable = drillData?.totalAvailable ?? 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!card || !answer.trim() || result) return;
    submitMutation.mutate({ formId: card.formId, answer: answer.trim() });
  };

  const toggleTense = (key: string) => {
    setSelectedTenses((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleDomain = (id: string) => {
    setSelectedDomains((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  if (drillState === "setup") {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold">{t("practiceTitle")}</h1>
          <p className="text-muted-foreground">{t("practiceSubtitle")}</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Languages className="h-5 w-5" />
              {t("languageTitle")}
            </CardTitle>
            <CardDescription>{t("languageDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {conjugatableLangs.map((lang) => (
              <Button
                key={lang.code}
                variant={selectedLang === lang.code ? "default" : "outline"}
                onClick={() => {
                  setSelectedLang(lang.code);
                  setSelectedTenses([]);
                }}
              >
                {lang.flag}{" "}
                {tLang(lang.code)}
              </Button>
            ))}
          </CardContent>
        </Card>

        {profile && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t("tensesTitle")}</CardTitle>
              <CardDescription>
                {t("tensesDesc", { langCode: selectedLang.toUpperCase() })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.tenses
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((tense) => (
                  <div key={tense.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`tense-${tense.key}`}
                      checked={selectedTenses.includes(tense.key)}
                      onCheckedChange={() => toggleTense(tense.key)}
                    />
                    <Label htmlFor={`tense-${tense.key}`}>{tense.label}</Label>
                  </div>
                ))}
            </CardContent>
          </Card>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("filterTitle")}</CardTitle>
            <CardDescription>{t("filterDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Checkbox
                id="only-irregular"
                checked={onlyIrregular}
                onCheckedChange={(checked) =>
                  setOnlyIrregular(checked === true)
                }
              />
              <Label htmlFor="only-irregular">
                {t("onlyIrregular", { langCode: selectedLang.toUpperCase() })}
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("domainsTitle")}</CardTitle>
            <CardDescription>{t("domainsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(domains ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noDomains")}</p>
            ) : (
              (domains ?? []).map((domain) => (
                <div key={domain.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`domain-${domain.id}`}
                    checked={selectedDomains.includes(domain.id)}
                    onCheckedChange={() => toggleDomain(domain.id)}
                  />
                  <Label htmlFor={`domain-${domain.id}`}>{domain.name}</Label>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Button size="lg" className="w-full gap-2" onClick={startDrill}>
          <Play className="h-4 w-4" />
          {t("startDrill")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => {
            setDrillState("setup");
            setResult(null);
            setAnswer("");
          }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {tCommon("back")}
        </Button>
        <Badge variant="outline">
          {t("formsAvailable", { count: totalAvailable })}
        </Badge>
      </div>

      {(isLoading || isFetching) && !card ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : !card ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="mb-4 text-muted-foreground">{t("noFormsFound")}</p>
            <Button variant="outline" onClick={() => setDrillState("setup")}>
              {t("changeSelection")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card key={cardKey}>
          <CardHeader>
            <CardDescription>{t("conjugatePrompt")}</CardDescription>
            <CardTitle className="text-3xl">{card.mainText}</CardTitle>
            <p className="text-muted-foreground">
              {t("infinitive")}{" "}
              <span className="font-medium">{card.infinitive}</span>
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Badge>{card.tenseLabel}</Badge>
              <Badge variant="secondary">{card.personLabel}</Badge>
              {card.isIrregular && (
                <Badge variant="outline">{tCommon("irregular")}</Badge>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={t("formPlaceholder")}
                disabled={!!result || submitMutation.isPending}
                autoFocus
              />
              {!result ? (
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!answer.trim() || submitMutation.isPending}
                >
                  {submitMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t("check")}
                </Button>
              ) : (
                <div className="space-y-4">
                  <div
                    className={`flex items-start gap-3 rounded-lg border p-4 ${
                      result.isCorrect
                        ? "border-green-500/40 bg-green-500/10"
                        : "border-red-500/40 bg-red-500/10"
                    }`}
                  >
                    {result.isCorrect ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="mt-0.5 h-5 w-5 text-red-600" />
                    )}
                    <div>
                      <p className="font-medium">
                        {result.isCorrect
                          ? result.typo
                            ? t("correctTypo")
                            : tReview("correct")
                          : tReview("incorrect")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("expectedLabel")}{" "}
                        <span className="font-medium">{result.expected}</span>
                      </p>
                    </div>
                  </div>
                  <Button type="button" className="w-full" onClick={() => void nextCard()}>
                    {t("nextForm")}
                  </Button>
                  <Button type="button" variant="link" asChild className="w-full">
                    <Link href={`/vocabulary/verbs/${card.entryId}`}>
                      {t("openVerb")}
                    </Link>
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

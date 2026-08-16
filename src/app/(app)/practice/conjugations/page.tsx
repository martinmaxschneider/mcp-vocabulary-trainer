"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { TARGET_LANGS, isTargetLang, type LearningLangCode } from "~/lib/languages";
import {
  CONJUGATABLE_LANGS,
  getConjugationProfile,
} from "~/lib/conjugation-catalog";
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
import { useFocusLang } from "~/components/focus-lang-provider";

type DrillState = "setup" | "active";
type DrillMode = "single" | "paradigm";

type SlotResult = {
  isCorrect: boolean;
  typo: boolean;
  expected: string;
};

export default function ConjugationDrillPage() {
  const t = useTranslations("conjugations");
  const tCommon = useTranslations("common");
  const tReview = useTranslations("review");
  const tLang = useTranslations("languages");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const [drillState, setDrillState] = useState<DrillState>("setup");
  const [drillMode, setDrillMode] = useState<DrillMode>("single");
  const conjugatableLangs = TARGET_LANGS.filter((l) =>
    (CONJUGATABLE_LANGS as readonly string[]).includes(l.code),
  );
  const { focusLang, setFocusLang } = useFocusLang();
  const selectedLang = conjugatableLangs.some((l) => l.code === focusLang)
    ? focusLang
    : (conjugatableLangs[0]?.code ?? "es");
  const setSelectedLang = (code: string) => {
    if (isTargetLang(code)) setFocusLang(code as LearningLangCode);
  };
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [selectedTenses, setSelectedTenses] = useState<string[]>([]);
  const [onlyIrregular, setOnlyIrregular] = useState(false);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<{
    isCorrect: boolean;
    expected: string;
    typo: boolean;
    boxBefore: number;
    boxAfter: number;
  } | null>(null);
  const [cardKey, setCardKey] = useState(0);
  const [awaitingParadigm, setAwaitingParadigm] = useState(false);
  const [paradigmAnswers, setParadigmAnswers] = useState<
    Record<string, string>
  >({});
  const [paradigmResults, setParadigmResults] = useState<
    Record<string, SlotResult> | null
  >(null);
  const [paradigmScore, setParadigmScore] = useState<{
    correctCount: number;
    totalCount: number;
  } | null>(null);
  const [paradigmTenseResults, setParadigmTenseResults] = useState<
    Array<{
      tenseKey: string;
      tenseLabel: string;
      boxBefore: number;
      boxAfter: number;
    }>
  >([]);

  const { data: domains } = api.domain.list.useQuery();
  const profile = getConjugationProfile(selectedLang);

  useEffect(() => {
    setSelectedTenses([]);
  }, [selectedLang]);

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
      mode: drillMode,
    },
    {
      enabled: drillState === "active",
      refetchOnWindowFocus: false,
    },
  );

  const submitMutation = api.conjugation.submitDrillAnswer.useMutation({
    onSuccess: (data) => {
      setResult({
        isCorrect: data.isCorrect,
        expected: data.expected,
        typo: data.typo,
        boxBefore: data.boxBefore,
        boxAfter: data.boxAfter,
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

  const submitParadigmMutation =
    api.conjugation.submitParadigmAnswers.useMutation({
      onSuccess: (data) => {
        const map: Record<string, SlotResult> = {};
        for (const r of data.results) {
          map[r.formId] = {
            isCorrect: r.isCorrect,
            typo: r.typo,
            expected: r.expected,
          };
        }
        setParadigmResults(map);
        setParadigmScore({
          correctCount: data.correctCount,
          totalCount: data.totalCount,
        });
        setParadigmTenseResults(
          data.tenseResults.map((r) => ({
            tenseKey: r.tenseKey,
            tenseLabel: r.tenseLabel,
            boxBefore: r.boxBefore,
            boxAfter: r.boxAfter,
          })),
        );
      },
      onError: (error) => {
        toast({
          title: tCommon("error"),
          description: errorDescription(error.message),
          variant: "destructive",
        });
      },
    });

  const paradigm = drillData?.paradigm;
  const slots = paradigm?.slots ?? [];
  const singleCard = drillData?.card;

  const slotsByTense = useMemo(() => {
    const groups: Array<{
      tenseKey: string;
      tenseLabel: string;
      slots: typeof slots;
    }> = [];
    for (const slot of slots) {
      const existing = groups.find((g) => g.tenseKey === slot.tenseKey);
      if (existing) {
        existing.slots.push(slot);
      } else {
        groups.push({
          tenseKey: slot.tenseKey,
          tenseLabel: slot.tenseLabel,
          slots: [slot],
        });
      }
    }
    return groups;
  }, [slots]);

  const totalAvailable = drillData?.totalAvailable ?? 0;
  const dueCount = drillData?.dueCount ?? 0;
  const hasContent =
    drillMode === "paradigm"
      ? !!paradigm && slots.length > 0
      : !!singleCard;

  useEffect(() => {
    if (drillState === "active" && !isFetching) {
      setAwaitingParadigm(false);
    }
  }, [drillState, isFetching, drillData]);

  // Reset paradigm inputs when a new verb/paradigm loads
  useEffect(() => {
    if (drillMode !== "paradigm" || !paradigm) return;
    setParadigmAnswers({});
    setParadigmResults(null);
    setParadigmScore(null);
    setParadigmTenseResults([]);
  }, [drillMode, paradigm?.translationId, cardKey]);

  const startDrill = () => {
    setResult(null);
    setAnswer("");
    setParadigmAnswers({});
    setParadigmResults(null);
    setParadigmScore(null);
    setParadigmTenseResults([]);
    setAwaitingParadigm(false);
    setCardKey((k) => k + 1);
    setDrillState("active");
  };

  const nextSingle = async () => {
    setResult(null);
    setAnswer("");
    setCardKey((k) => k + 1);
    await refetch();
  };

  const nextParadigm = async () => {
    setParadigmAnswers({});
    setParadigmResults(null);
    setParadigmScore(null);
    setParadigmTenseResults([]);
    setCardKey((k) => k + 1);
    setAwaitingParadigm(true);
    await refetch();
  };

  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleCard || !answer.trim() || result) return;
    submitMutation.mutate({ formId: singleCard.formId, answer: answer.trim() });
  };

  const handleParadigmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paradigm || paradigmResults || submitParadigmMutation.isPending) {
      return;
    }
    const payload = slots.map((slot) => ({
      formId: slot.formId,
      answer: (paradigmAnswers[slot.formId] ?? "").trim(),
    }));
    if (payload.every((p) => !p.answer)) return;
    submitParadigmMutation.mutate({ answers: payload });
  };

  const paradigmFilledCount = slots.filter(
    (s) => (paradigmAnswers[s.formId] ?? "").trim().length > 0,
  ).length;

  const toggleTense = (key: string) => {
    setSelectedTenses((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const toggleDomain = (id: string) => {
    setSelectedDomains((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
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
                {lang.flag} {tLang(lang.code)}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("modeTitle")}</CardTitle>
            <CardDescription>{t("modeDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant={drillMode === "single" ? "default" : "outline"}
              onClick={() => setDrillMode("single")}
            >
              {t("modeSingle")}
            </Button>
            <Button
              variant={drillMode === "paradigm" ? "default" : "outline"}
              onClick={() => setDrillMode("paradigm")}
            >
              {t("modeParadigm")}
            </Button>
          </CardContent>
        </Card>

        {profile && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t("tensesTitle")}</CardTitle>
              <CardDescription>
                {drillMode === "paradigm"
                  ? t("tensesDescParadigm", {
                      langCode: selectedLang.toUpperCase(),
                    })
                  : t("tensesDesc", { langCode: selectedLang.toUpperCase() })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="cahier-section space-y-2">
              {profile.tenses
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((tense) => (
                  <div
                    key={tense.key}
                    className={`cahier-item flex items-center gap-3 p-3 ${
                      selectedTenses.includes(tense.key)
                        ? "cahier-item-selected"
                        : ""
                    }`}
                  >
                    <Checkbox
                      id={`tense-${tense.key}`}
                      checked={selectedTenses.includes(tense.key)}
                      onCheckedChange={() => toggleTense(tense.key)}
                    />
                    <Label htmlFor={`tense-${tense.key}`}>{tense.label}</Label>
                  </div>
                ))}
              </div>
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
          <CardContent>
            {(domains ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noDomains")}</p>
            ) : (
              <div className="cahier-section space-y-2">
              {(domains ?? []).map((domain) => (
                <div
                  key={domain.id}
                  className={`cahier-item flex items-center gap-3 p-3 ${
                    selectedDomains.includes(domain.id)
                      ? "cahier-item-selected"
                      : ""
                  }`}
                >
                  <Checkbox
                    id={`domain-${domain.id}`}
                    checked={selectedDomains.includes(domain.id)}
                    onCheckedChange={() => toggleDomain(domain.id)}
                  />
                  <Label htmlFor={`domain-${domain.id}`}>{domain.name}</Label>
                </div>
              ))}
              </div>
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
            setParadigmAnswers({});
            setParadigmResults(null);
            setParadigmScore(null);
            setParadigmTenseResults([]);
            setAwaitingParadigm(false);
          }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {tCommon("back")}
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {dueCount > 0 && (
            <Badge>{t("dueCount", { count: dueCount })}</Badge>
          )}
          <Badge variant="outline">
            {drillMode === "paradigm"
              ? t("verbsAvailable", { count: totalAvailable })
              : t("formsAvailable", { count: totalAvailable })}
          </Badge>
        </div>
      </div>

      {isLoading || awaitingParadigm || (isFetching && !hasContent) ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : !hasContent ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="mb-4 text-muted-foreground">{t("noFormsFound")}</p>
            <Button variant="outline" onClick={() => setDrillState("setup")}>
              {t("changeSelection")}
            </Button>
          </CardContent>
        </Card>
      ) : drillMode === "paradigm" && paradigm ? (
        <Card key={cardKey}>
          <CardHeader>
            <CardDescription>{t("paradigmPrompt")}</CardDescription>
            <CardTitle className="text-3xl">{paradigm.mainText}</CardTitle>
            <p className="text-muted-foreground">
              {t("infinitive")}{" "}
              <span className="font-medium">{paradigm.infinitive}</span>
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant="secondary">
                {t("formsInParadigm", { count: slots.length })}
              </Badge>
              {paradigm.isIrregular && (
                <Badge variant="outline">{tCommon("irregular")}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleParadigmSubmit} className="space-y-6">
              {slotsByTense.map((group) => (
                <div key={group.tenseKey} className="space-y-3">
                  <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                    {group.tenseLabel}
                  </h3>
                  <div className="space-y-2">
                    {group.slots.map((slot) => {
                      const slotResult = paradigmResults?.[slot.formId];
                      return (
                        <div key={slot.formId} className="space-y-1">
                          <div className="flex items-center gap-3">
                            <Label
                              htmlFor={`slot-${slot.formId}`}
                              className="w-24 shrink-0 text-sm"
                            >
                              {slot.personLabel}
                            </Label>
                            <Input
                              id={`slot-${slot.formId}`}
                              value={paradigmAnswers[slot.formId] ?? ""}
                              onChange={(e) =>
                                setParadigmAnswers((prev) => ({
                                  ...prev,
                                  [slot.formId]: e.target.value,
                                }))
                              }
                              placeholder={t("formPlaceholder")}
                              disabled={
                                !!paradigmResults ||
                                submitParadigmMutation.isPending
                              }
                              className={
                                slotResult
                                  ? slotResult.isCorrect
                                    ? "border-green-500/60"
                                    : "border-red-500/60"
                                  : undefined
                              }
                            />
                            {slotResult ? (
                              slotResult.isCorrect ? (
                                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                              ) : (
                                <XCircle className="h-5 w-5 shrink-0 text-red-600" />
                              )
                            ) : null}
                          </div>
                          {slotResult && !slotResult.isCorrect && (
                            <p className="pl-28 text-xs text-muted-foreground">
                              {t("expectedLabel")}{" "}
                              <span className="font-medium">
                                {slotResult.expected}
                              </span>
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {!paradigmResults ? (
                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    paradigmFilledCount === 0 ||
                    submitParadigmMutation.isPending
                  }
                >
                  {submitParadigmMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t("checkParadigm")}
                </Button>
              ) : (
                <div className="space-y-4">
                  {paradigmScore && (
                    <p className="text-center text-sm font-medium">
                      {t("paradigmScore", {
                        correct: paradigmScore.correctCount,
                        total: paradigmScore.totalCount,
                      })}
                    </p>
                  )}
                  {paradigmTenseResults.length > 0 && (
                    <div className="space-y-1 text-center text-sm text-muted-foreground">
                      {paradigmTenseResults.map((tense) => (
                        <p key={tense.tenseKey}>
                          {tense.tenseLabel}:{" "}
                          {t("boxMoved", {
                            from: tense.boxBefore,
                            to: tense.boxAfter,
                          })}
                        </p>
                      ))}
                    </div>
                  )}
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => void nextParadigm()}
                  >
                    {t("nextVerb")}
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    asChild
                    className="w-full"
                  >
                    <Link href={`/vocabulary/verbs/${paradigm.entryId}`}>
                      {t("openVerb")}
                    </Link>
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      ) : singleCard ? (
        <Card key={cardKey}>
          <CardHeader>
            <CardDescription>{t("conjugatePrompt")}</CardDescription>
            <CardTitle className="text-3xl">{singleCard.mainText}</CardTitle>
            <p className="text-muted-foreground">
              {t("infinitive")}{" "}
              <span className="font-medium">{singleCard.infinitive}</span>
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Badge>{singleCard.tenseLabel}</Badge>
              <Badge variant="secondary">{singleCard.personLabel}</Badge>
              {singleCard.isIrregular && (
                <Badge variant="outline">{tCommon("irregular")}</Badge>
              )}
            </div>

            <form onSubmit={handleSingleSubmit} className="space-y-4">
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
                      <p className="text-sm text-muted-foreground">
                        {t("boxMoved", {
                          from: result.boxBefore,
                          to: result.boxAfter,
                        })}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => void nextSingle()}
                  >
                    {t("nextForm")}
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    asChild
                    className="w-full"
                  >
                    <Link href={`/vocabulary/verbs/${singleCard.entryId}`}>
                      {t("openVerb")}
                    </Link>
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

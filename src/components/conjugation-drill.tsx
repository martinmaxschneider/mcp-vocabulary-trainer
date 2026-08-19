"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  TARGET_LANGS,
  getTargetLang,
} from "~/lib/languages";
import { cn } from "~/lib/utils";
import { groupDomainsByKind } from "~/lib/domain-catalog";
import { Caveat, Libre_Baskerville } from "next/font/google";
import {
  CONJUGATABLE_LANGS,
  getConjugationProfile,
} from "~/lib/conjugation-catalog";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import {
  CahierQuizCard,
  CahierQuizFrame,
} from "~/components/cahier-quiz-view";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";
import { Loader2 } from "lucide-react";
import { useFocusLang } from "~/components/focus-lang-provider";
import { useCelebrate } from "~/components/gamification-provider";
import { SessionSummary } from "~/components/session-summary";
import { PracticeModeButtons } from "~/components/practice-mode-buttons";
import { CELEBRATIONS } from "~/lib/gamification-config";

const caveat = Caveat({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
});

const libreBaskerville = Libre_Baskerville({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

type DrillState = "setup" | "active";
type DrillMode = "single" | "paradigm";

type SlotResult = {
  isCorrect: boolean;
  typo: boolean;
  expected: string;
};

export function ConjugationDrill() {
  const t = useTranslations("conjugations");
  const tDomains = useTranslations("domains");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("languages");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const celebrate = useCelebrate();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [drillState, setDrillState] = useState<DrillState>("setup");
  const [practiceMode, setPracticeMode] = useState(false);
  const [drillMode, setDrillMode] = useState<DrillMode>("single");
  const conjugatableLangs = TARGET_LANGS.filter((l) =>
    (CONJUGATABLE_LANGS as readonly string[]).includes(l.code),
  );
  const { focusLang } = useFocusLang();
  const selectedLang = conjugatableLangs.some((l) => l.code === focusLang)
    ? focusLang
    : (conjugatableLangs[0]?.code ?? "es");
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
  const [session, setSession] = useState({
    answers: 0,
    correct: 0,
    xp: 0,
    streak: 0,
  });
  const [showSummary, setShowSummary] = useState(false);

  const { data: domains } = api.domain.list.useQuery();
  const profile = getConjugationProfile(selectedLang);

  useEffect(() => {
    if (searchParams.get("start") !== "1") return;
    setSelectedDomains([]);
    setSelectedTenses([]);
    setOnlyIrregular(false);
    setDrillMode("paradigm");
    setResult(null);
    setAnswer("");
    setParadigmAnswers({});
    setParadigmResults(null);
    setParadigmScore(null);
    setParadigmTenseResults([]);
    setAwaitingParadigm(false);
    setSession({ answers: 0, correct: 0, xp: 0, streak: 0 });
    setShowSummary(false);
    setCardKey((k) => k + 1);
    setDrillState("active");
    router.replace("/practice/conjugations", { scroll: false });
  }, [searchParams, router]);

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
      practice: practiceMode || undefined,
    },
    {
      enabled: drillState === "active",
      refetchOnWindowFocus: false,
    },
  );

  const reportSession = api.gamification.reportSession.useMutation({
    onSuccess: (data) => {
      celebrate(data, {
        perfectSession:
          session.answers >= (CELEBRATIONS.perfectSession.minCards ?? 10) &&
          session.correct === session.answers,
        sessionAnswers: session.answers,
      });
    },
  });

  const submitMutation = api.conjugation.submitDrillAnswer.useMutation({
    onSuccess: (data) => {
      if (data.gamification) celebrate(data.gamification);
      setSession((prev) => ({
        answers: prev.answers + 1,
        correct: prev.correct + (data.isCorrect ? 1 : 0),
        xp: prev.xp + (data.gamification?.xpEarned ?? 0),
        streak: data.gamification?.streak ?? prev.streak,
      }));
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
        celebrate(data.gamification);
        setSession((prev) => ({
          answers: prev.answers + data.totalCount,
          correct: prev.correct + data.correctCount,
          xp: prev.xp + (data.gamification?.xpEarned ?? 0),
          streak: data.gamification?.streak ?? prev.streak,
        }));
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

  useEffect(() => {
    if (
      drillState === "active" &&
      !isFetching &&
      !hasContent &&
      session.answers > 0 &&
      !showSummary
    ) {
      reportSession.mutate({
        answers: session.answers,
        correct: session.correct,
      });
      setShowSummary(true);
    }
  }, [
    drillState,
    isFetching,
    hasContent,
    session.answers,
    session.correct,
    showSummary,
    reportSession,
  ]);

  // Reset paradigm inputs when a new verb/paradigm loads
  useEffect(() => {
    if (drillMode !== "paradigm" || !paradigm) return;
    setParadigmAnswers({});
    setParadigmResults(null);
    setParadigmScore(null);
    setParadigmTenseResults([]);
  }, [drillMode, paradigm?.translationId, cardKey]);

  const backToSetup = () => {
    setDrillState("setup");
    setResult(null);
    setAnswer("");
    setParadigmAnswers({});
    setParadigmResults(null);
    setParadigmScore(null);
    setParadigmTenseResults([]);
    setAwaitingParadigm(false);
    setSession({ answers: 0, correct: 0, xp: 0, streak: 0 });
    setShowSummary(false);
  };

  const startDrill = (practice = false) => {
    setPracticeMode(practice);
    setResult(null);
    setAnswer("");
    setParadigmAnswers({});
    setParadigmResults(null);
    setParadigmScore(null);
    setParadigmTenseResults([]);
    setAwaitingParadigm(false);
    setSession({ answers: 0, correct: 0, xp: 0, streak: 0 });
    setShowSummary(false);
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

  const allTenseKeys = profile?.tenses.map((tense) => tense.key) ?? [];

  const toggleAllTenses = () => {
    setSelectedTenses((prev) =>
      prev.length === allTenseKeys.length ? [] : allTenseKeys,
    );
  };

  const toggleAllDomains = () => {
    const ids = (domains ?? []).map((d) => d.id);
    setSelectedDomains((prev) => (prev.length === ids.length ? [] : ids));
  };

  if (drillState === "setup") {
    return (
      <>
        <header className="mb-8 space-y-3">
          <p className={cn("text-lg text-red-600", caveat.className)}>
            {t("cahierLabel")}
          </p>
          <h1
            className={cn(
              "text-4xl font-bold text-[#1e3a5f]",
              libreBaskerville.className,
            )}
          >
            {t("practiceTitle")}
          </h1>
          <p className="text-sm text-slate-600">{t("practiceSubtitle")}</p>
        </header>

        <section className="cahier-card p-6 sm:p-8">
          <div className="space-y-8">
            <div>
              <h3 className="mb-3 font-semibold text-[#1e3a5f]">
                {t("modeTitle")}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(
                  [
                    ["single", "modeSingle", "modeSingleHint"],
                    ["paradigm", "modeParadigm", "modeParadigmHint"],
                  ] as const
                ).map(([mode, titleKey, hintKey]) => (
                  <button
                    key={mode}
                    type="button"
                    className={cn(
                      "rounded-xl border px-4 py-4 text-left transition",
                      drillMode === mode
                        ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                        : "border-slate-200 bg-white text-[#1e3a5f] hover:border-[#1e3a5f]/40",
                    )}
                    onClick={() => setDrillMode(mode)}
                  >
                    <span className="block font-semibold">{t(titleKey)}</span>
                    <span
                      className={cn(
                        "mt-1 block text-sm",
                        drillMode === mode ? "text-white" : "text-slate-500",
                      )}
                    >
                      {t(hintKey)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {profile ? (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-[#1e3a5f]">
                    {t("tensesTitle")}
                  </h3>
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-[#1e3a5f]"
                    onClick={toggleAllTenses}
                  >
                    {selectedTenses.length === allTenseKeys.length
                      ? tCommon("deselectAll")
                      : tCommon("selectAll")}
                  </button>
                </div>
                <div className="grid max-h-64 grid-cols-1 gap-3 overflow-y-auto p-1 sm:grid-cols-2">
                  {profile.tenses
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((tense) => (
                      <button
                        key={tense.key}
                        type="button"
                        className={cn(
                          "flex items-center gap-3 rounded-xl border p-3 text-left transition",
                          selectedTenses.includes(tense.key)
                            ? "border-[#1e3a5f] bg-[#1e3a5f]/5"
                            : "border-slate-200 bg-white hover:border-[#1e3a5f]/30",
                        )}
                        onClick={() => toggleTense(tense.key)}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            selectedTenses.includes(tense.key)
                              ? "border-[#1e3a5f] bg-[#1e3a5f]"
                              : "border-slate-300 bg-white",
                          )}
                        />
                        <span className="font-medium text-[#1e3a5f]">
                          {tense.label}
                        </span>
                      </button>
                    ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {drillMode === "paradigm"
                    ? t("tensesDescParadigm", {
                        langCode: selectedLang.toUpperCase(),
                      })
                    : t("tensesDesc", {
                        langCode: selectedLang.toUpperCase(),
                      })}
                </p>
              </div>
            ) : null}

            <div>
              <h3 className="mb-3 font-semibold text-[#1e3a5f]">
                {t("filterTitle")}
              </h3>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition",
                  onlyIrregular
                    ? "border-[#1e3a5f] bg-[#1e3a5f]/5"
                    : "border-slate-200 bg-white hover:border-[#1e3a5f]/30",
                )}
                onClick={() => setOnlyIrregular((v) => !v)}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    onlyIrregular
                      ? "border-[#1e3a5f] bg-[#1e3a5f]"
                      : "border-slate-300 bg-white",
                  )}
                />
                <span className="font-medium text-[#1e3a5f]">
                  {t("onlyIrregular", {
                    langCode: selectedLang.toUpperCase(),
                  })}
                </span>
              </button>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-[#1e3a5f]">
                  {t("domainsTitle")}
                </h3>
                {(domains ?? []).length > 0 ? (
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-[#1e3a5f]"
                    onClick={toggleAllDomains}
                  >
                    {selectedDomains.length === (domains?.length ?? 0)
                      ? tCommon("deselectAll")
                      : tCommon("selectAll")}
                  </button>
                ) : null}
              </div>
              {(domains ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">{t("noDomains")}</p>
              ) : (
                <div className="max-h-72 space-y-4 overflow-y-auto p-1">
                  {groupDomainsByKind(domains ?? []).map((group) => (
                    <div key={group.kind} className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {tDomains(`kind${group.kind}`)}
                      </h4>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {group.domains.map((domain) => (
                          <button
                            key={domain.id}
                            type="button"
                            className={cn(
                              "flex items-center gap-3 rounded-xl border p-3 text-left transition",
                              selectedDomains.includes(domain.id)
                                ? "border-[#1e3a5f] bg-[#1e3a5f]/5"
                                : "border-slate-200 bg-white hover:border-[#1e3a5f]/30",
                            )}
                            onClick={() => toggleDomain(domain.id)}
                          >
                            <span
                              className={cn(
                                "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                selectedDomains.includes(domain.id)
                                  ? "border-[#1e3a5f] bg-[#1e3a5f]"
                                  : "border-slate-300 bg-white",
                              )}
                            />
                            <span className="font-medium text-[#1e3a5f]">
                              {domain.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500">{t("domainsDesc")}</p>
            </div>

            <PracticeModeButtons
              onReview={() => startDrill(false)}
              onPractice={() => startDrill(true)}
              onListen={() => router.push("/practice/conjugations/listen")}
            />
          </div>
        </section>
      </>
    );
  }

  const currentLang = getTargetLang(selectedLang);
  const remainingInRun = drillData?.boxCounts
    ? Object.values(drillData.boxCounts).reduce((sum, n) => sum + n, 0)
    : 0;

  return (
    <CahierQuizFrame
      kicker={t("cahierLabel")}
      cardsLeft={remainingInRun > 0 ? remainingInRun : null}
      langPill={
        <>
          {currentLang?.flag} {tLang(selectedLang)}
        </>
      }
      onBack={backToSetup}
      backLabel={tCommon("back")}
      remainingBoxes={
        drillData?.boxCounts && hasContent ? drillData.boxCounts : null
      }
    >
      {isLoading || awaitingParadigm || (isFetching && !hasContent) ? (
        <div className="cahier-card py-16 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#1e3a5f]" />
        </div>
      ) : !hasContent && session.answers > 0 ? (
        <SessionSummary
          answers={session.answers}
          correct={session.correct}
          xp={session.xp}
          streak={session.streak}
          perfect={
            session.answers >= (CELEBRATIONS.perfectSession.minCards ?? 10) &&
            session.correct === session.answers
          }
          onDone={backToSetup}
        />
      ) : !hasContent ? (
        <div className="cahier-card py-16 text-center">
          <p className="mb-4 text-slate-600">{t("noFormsFound")}</p>
          <Button variant="outline" onClick={backToSetup}>
            {t("changeSelection")}
          </Button>
        </div>
      ) : drillMode === "paradigm" && paradigm ? (
        <CahierQuizCard
          cardKey={cardKey}
          badges={
            slotsByTense[0]
              ? [{ label: slotsByTense[0].tenseLabel }]
              : undefined
          }
          prompt={paradigm.mainText}
          subtitle={
            <>
              <span className="italic text-slate-600">{paradigm.infinitive}</span>
              {paradigm.isIrregular ? (
                <span className="ml-2 text-xs uppercase tracking-wide text-red-600">
                  {tCommon("irregular")}
                </span>
              ) : null}
            </>
          }
          mode="paradigm"
          paradigmSlots={slots.map((slot) => ({
            key: slot.formId,
            label: slot.personLabel,
            tenseKey: slot.tenseKey,
            tenseLabel: slot.tenseLabel,
            personIndex: slot.personIndex,
          }))}
          paradigmValues={paradigmAnswers}
          onParadigmChange={(key, value) =>
            setParadigmAnswers((prev) => ({ ...prev, [key]: value }))
          }
          onParadigmSubmit={() => {
            if (paradigmResults || submitParadigmMutation.isPending) return;
            const payload = slots.map((slot) => ({
              formId: slot.formId,
              answer: (paradigmAnswers[slot.formId] ?? "").trim(),
            }));
            if (payload.every((item) => !item.answer)) return;
            submitParadigmMutation.mutate({
              answers: payload,
              skipProgress: practiceMode || undefined,
            });
          }}
          paradigmResults={paradigmResults}
          onParadigmNext={() => void nextParadigm()}
          pending={submitParadigmMutation.isPending}
          paradigmScore={
            paradigmScore ? (
              <div className="space-y-1">
                <p className="text-center text-sm font-medium text-[#1e3a5f]">
                  {t("paradigmScore", {
                    correct: paradigmScore.correctCount,
                    total: paradigmScore.totalCount,
                  })}
                </p>
                {paradigmTenseResults.length > 0 ? (
                  <div className="space-y-1 text-center text-sm text-slate-500">
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
                ) : null}
              </div>
            ) : null
          }
          resultExtra={
            <Button
              type="button"
              variant="ghost"
              asChild
              className="w-full text-[#1e3a5f]"
            >
              <Link href={`/vocabulary/verbs/${paradigm.entryId}`}>
                {t("openVerb")}
              </Link>
            </Button>
          }
        />
      ) : singleCard ? (
        <CahierQuizCard
          cardKey={cardKey}
          badges={[
            { label: singleCard.tenseLabel },
            { label: singleCard.personLabel, variant: "secondary" },
            ...(singleCard.isIrregular
              ? [{ label: tCommon("irregular") }]
              : []),
          ]}
          prompt={singleCard.mainText}
          subtitle={
            <span className="italic text-slate-600">{singleCard.infinitive}</span>
          }
          mode="typed"
          typedValue={answer}
          onTypedChange={setAnswer}
          onTypedSubmit={() => {
            if (!answer.trim() || result) return;
            submitMutation.mutate({
              formId: singleCard.formId,
              answer: answer.trim(),
              skipProgress: practiceMode || undefined,
            });
          }}
          typedPlaceholder={t("formPlaceholder")}
          typedCheckLabel={t("check")}
          typedResult={
            result
              ? {
                  isCorrect: result.isCorrect,
                  expected: result.expected,
                  typo: result.typo,
                  yourAnswer: answer,
                }
              : null
          }
          onTypedNext={() => void nextSingle()}
          typedNextLabel={t("nextForm")}
          pending={submitMutation.isPending}
          resultExtra={
            result ? (
              <div className="space-y-4">
                <p className="text-center text-sm text-muted-foreground">
                  {t("boxMoved", {
                    from: result.boxBefore,
                    to: result.boxAfter,
                  })}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  asChild
                  className="w-full text-[#1e3a5f]"
                >
                  <Link href={`/vocabulary/verbs/${singleCard.entryId}`}>
                    {t("openVerb")}
                  </Link>
                </Button>
              </div>
            ) : null
          }
        />
      ) : null}
    </CahierQuizFrame>
  );
}

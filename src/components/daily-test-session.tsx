"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { DailyItemType } from "@prisma/client";
import { CahierQuizView } from "~/components/cahier-quiz-view";
import { SatzDriftReport } from "~/components/satz-drift-report";
import { SatzAudioButton } from "~/components/satz-audio-button";
import { getTargetLang, SOURCE_LANG } from "~/lib/languages";
import { matchAnswer } from "~/lib/matching";

type DailyTestClip = {
  url: string;
  kind?: "main" | "translation";
};

type DailyTestForm = {
  personIndex: number;
  personLabel: string;
  form: string;
};

export type DailyTestItem = {
  id: string;
  itemType: DailyItemType;
  refId: string;
  nativeText: string;
  targetText: string;
  domain?: { name: string } | null;
  tenseLabel?: string | null;
  questionText?: string | null;
  forms: DailyTestForm[];
  answerClips: DailyTestClip[];
};

export function DailyTestSession({
  item,
  cardsLeft,
  focusLang,
  pending,
  onBack,
  onSubmit,
}: {
  item: DailyTestItem;
  cardsLeft: number;
  focusLang: string;
  pending: boolean;
  onBack: () => void;
  onSubmit: (isCorrect: boolean) => Promise<void>;
}) {
  const t = useTranslations("daily");
  const tReview = useTranslations("review");
  const tLang = useTranslations("languages");
  const tSentences = useTranslations("sentences");
  const focusMeta = getTargetLang(focusLang);

  const [nativeText, setNativeText] = useState(item.nativeText);
  const [targetText, setTargetText] = useState(item.targetText);
  const [revealed, setRevealed] = useState(false);
  const [typedValue, setTypedValue] = useState("");
  const [typedResult, setTypedResult] = useState<{
    isCorrect: boolean;
    expected: string;
    typo?: boolean;
    yourAnswer?: string;
  } | null>(null);
  const [paradigmValues, setParadigmValues] = useState<Record<string, string>>(
    {},
  );
  const [paradigmResults, setParadigmResults] = useState<Record<
    string,
    { isCorrect: boolean; expected: string }
  > | null>(null);
  const [paradigmCorrect, setParadigmCorrect] = useState(false);

  useEffect(() => {
    setNativeText(item.nativeText);
    setTargetText(item.targetText);
    setRevealed(false);
    setTypedValue("");
    setTypedResult(null);
    setParadigmValues({});
    setParadigmResults(null);
    setParadigmCorrect(false);
  }, [item.id, item.nativeText, item.targetText]);

  const promptUrls = useMemo(
    () =>
      item.answerClips
        .filter((clip) => clip.kind === "main")
        .map((clip) => clip.url),
    [item.answerClips],
  );
  const answerUrls = useMemo(
    () =>
      item.answerClips
        .filter((clip) => (clip.kind ?? "translation") === "translation")
        .map((clip) => clip.url),
    [item.answerClips],
  );

  const badges = [
    { label: t(`type${item.itemType}`), variant: "secondary" as const },
    ...(item.domain ? [{ label: item.domain.name }] : []),
    ...(item.tenseLabel ? [{ label: item.tenseLabel }] : []),
  ];

  const langPill = (
    <>
      {focusMeta?.flag} {tLang(focusLang)}
    </>
  );

  const gradeTyped = (userAnswer: string) => {
    const match = matchAnswer({
      userAnswer,
      expected: item.targetText,
    });
    setTypedResult({
      isCorrect: match.isCorrect,
      expected: item.targetText,
      typo: match.isTypo,
      yourAnswer: userAnswer,
    });
  };

  if (item.itemType === DailyItemType.SATZ) {
    return (
      <CahierQuizView
        kicker={t("kicker")}
        cardsLeft={cardsLeft}
        langPill={langPill}
        onBack={onBack}
        backLabel={t("backToOverview")}
        cardKey={item.id}
        badges={badges}
        prompt={nativeText}
        subtitle={item.questionText}
        promptAudio={
          promptUrls.length > 0
            ? {
                urls: promptUrls,
                langCode: SOURCE_LANG.code,
                label: tSentences("playAudioLang", {
                  language: tLang(SOURCE_LANG.code),
                }),
              }
            : null
        }
        mode="selfGrade"
        revealed={revealed}
        answer={targetText}
        answerAudio={
          answerUrls.length > 0
            ? {
                urls: answerUrls,
                langCode: focusLang,
                label: tSentences("playAudioLang", {
                  language: tLang(focusLang),
                }),
              }
            : null
        }
        afterGrade={
          <SatzDriftReport
            satzId={item.refId}
            targetLang={focusLang}
            onApplied={({ fix, newText }) => {
              if (fix === "SOURCE") setNativeText(newText);
              else setTargetText(newText);
            }}
          />
        }
        pending={pending}
        onReveal={() => setRevealed(true)}
        onKnew={() => void onSubmit(true)}
        onDidNotKnow={() => void onSubmit(false)}
      />
    );
  }

  if (item.itemType === DailyItemType.CONJUGATION) {
    return (
      <CahierQuizView
        kicker={t("kicker")}
        cardsLeft={cardsLeft}
        langPill={langPill}
        onBack={onBack}
        backLabel={t("backToOverview")}
        cardKey={item.id}
        badges={badges}
        prompt={item.nativeText}
        subtitle={item.targetText}
        mode="paradigm"
        paradigmSlots={item.forms.map((form) => ({
          key: String(form.personIndex),
          label: form.personLabel,
          personIndex: form.personIndex,
        }))}
        paradigmValues={paradigmValues}
        onParadigmChange={(key, value) =>
          setParadigmValues((prev) => ({ ...prev, [key]: value }))
        }
        onParadigmSubmit={() => {
          const next: Record<string, { isCorrect: boolean; expected: string }> =
            {};
          let allCorrect = item.forms.length > 0;
          for (const form of item.forms) {
            const key = String(form.personIndex);
            const match = matchAnswer({
              userAnswer: paradigmValues[key] ?? "",
              expected: form.form,
            });
            next[key] = { isCorrect: match.isCorrect, expected: form.form };
            if (!match.isCorrect) allCorrect = false;
          }
          setParadigmResults(next);
          setParadigmCorrect(allCorrect);
        }}
        paradigmResults={paradigmResults}
        onParadigmNext={() => void onSubmit(paradigmCorrect)}
        pending={pending}
        resultExtra={
          answerUrls.length > 0 ? (
            <div className="flex justify-center">
              <SatzAudioButton
                urls={answerUrls}
                langCode={focusLang}
                label={tSentences("playAudioLang", {
                  language: tLang(focusLang),
                })}
              />
            </div>
          ) : null
        }
      />
    );
  }

  return (
    <CahierQuizView
      kicker={t("kicker")}
      cardsLeft={cardsLeft}
      langPill={langPill}
      onBack={onBack}
      backLabel={t("backToOverview")}
      cardKey={item.id}
      badges={badges}
      prompt={item.nativeText}
      mode="typed"
      typedValue={typedValue}
      onTypedChange={setTypedValue}
      onTypedSubmit={() => gradeTyped(typedValue)}
      onShowSolution={() => gradeTyped("")}
      typedPlaceholder={tReview("answerPlaceholder")}
      typedResult={typedResult}
      onTypedNext={() => void onSubmit(typedResult?.isCorrect ?? false)}
      pending={pending}
      resultExtra={
        answerUrls.length > 0 ? (
          <div className="flex justify-center">
            <SatzAudioButton
              urls={answerUrls}
              langCode={focusLang}
              label={tSentences("playAudioLang", {
                language: tLang(focusLang),
              })}
            />
          </div>
        ) : null
      }
    />
  );
}

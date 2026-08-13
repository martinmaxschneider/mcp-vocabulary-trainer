"use client";

import { useMemo, useState } from "react";
import { WorksheetQuestionType } from "@prisma/client";
import { useTranslations } from "next-intl";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import { getConjugationProfile } from "~/lib/conjugation-catalog";
import {
  clozePayloadSchema,
  conjugationGridPayloadSchema,
  errorCorrectionPayloadSchema,
  matchingPayloadSchema,
  multipleChoicePayloadSchema,
  sentenceReorderPayloadSchema,
  type WorksheetUserAnswer,
} from "~/lib/schemas/worksheet";
import { splitCloze } from "~/lib/worksheet-display";

type Props = {
  type: WorksheetQuestionType;
  payload: unknown;
  targetLang: string;
  value: WorksheetUserAnswer | undefined;
  onChange: (value: WorksheetUserAnswer) => void;
  disabled?: boolean;
};

const sheetInputClass =
  "border-slate-300 bg-white text-[#1e3a5f] placeholder:text-slate-400 focus-visible:ring-[#1e3a5f]";

export function QuestionInput(props: Props) {
  switch (props.type) {
    case WorksheetQuestionType.MULTIPLE_CHOICE:
      return <MultipleChoiceInput {...props} />;
    case WorksheetQuestionType.CLOZE:
      return <ClozeInput {...props} />;
    case WorksheetQuestionType.FREE_TEXT:
      return <FreeTextInput {...props} />;
    case WorksheetQuestionType.ERROR_CORRECTION:
      return <ErrorCorrectionInput {...props} />;
    case WorksheetQuestionType.SENTENCE_REORDER:
      return <SentenceReorderInput {...props} />;
    case WorksheetQuestionType.MATCHING:
      return <MatchingInput {...props} />;
    case WorksheetQuestionType.TRUE_FALSE:
      return <TrueFalseInput {...props} />;
    case WorksheetQuestionType.CONJUGATION_GRID:
      return <ConjugationGridInput {...props} />;
    default:
      return null;
  }
}

function MultipleChoiceInput({ payload, value, onChange, disabled }: Props) {
  const parsed = multipleChoicePayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const selected =
    value?.type === WorksheetQuestionType.MULTIPLE_CHOICE ? value.optionId : "";

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {parsed.data.options.map((option) => (
        <button
          key={option.id}
          type="button"
          disabled={disabled}
          onClick={() =>
            onChange({ type: WorksheetQuestionType.MULTIPLE_CHOICE, optionId: option.id })
          }
          className={cn(
            "rounded-md border px-3 py-2 text-left text-sm transition",
            selected === option.id
              ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
              : "border-slate-300 bg-white hover:border-[#1e3a5f]/50",
            disabled && "opacity-70",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ClozeInput({ payload, value, onChange, disabled }: Props) {
  const t = useTranslations("worksheets");
  const parsed = clozePayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const parts = splitCloze(parsed.data.text);
  const blanks =
    value?.type === WorksheetQuestionType.CLOZE
      ? value.blanks
      : Array.from({ length: Math.max(parts.length - 1, 0) }, () => "");

  return (
    <p className="flex flex-wrap items-baseline gap-x-1 gap-y-2 text-[15px] leading-8">
      {parts.map((part, index) => (
        <span key={index} className="contents">
          <span>{part}</span>
          {index < parts.length - 1 ? (
            <Input
              value={blanks[index] ?? ""}
              disabled={disabled}
              placeholder={t("blankPlaceholder")}
              onChange={(event) => {
                const next = [...blanks];
                next[index] = event.target.value;
                onChange({ type: WorksheetQuestionType.CLOZE, blanks: next });
              }}
              className={cn(sheetInputClass, "inline-flex h-8 w-28")}
            />
          ) : null}
        </span>
      ))}
    </p>
  );
}

function FreeTextInput({ value, onChange, disabled }: Props) {
  const t = useTranslations("worksheets");
  const text = value?.type === WorksheetQuestionType.FREE_TEXT ? value.text : "";
  return (
    <textarea
      value={text}
      disabled={disabled}
      rows={3}
      placeholder={t("answerPlaceholder")}
      onChange={(event) =>
        onChange({ type: WorksheetQuestionType.FREE_TEXT, text: event.target.value })
      }
      className={cn(
        "w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        sheetInputClass,
      )}
    />
  );
}

function ErrorCorrectionInput({ payload, value, onChange, disabled }: Props) {
  const t = useTranslations("worksheets");
  const parsed = errorCorrectionPayloadSchema.safeParse(payload);
  const text =
    value?.type === WorksheetQuestionType.ERROR_CORRECTION ? value.text : "";
  return (
    <div className="space-y-3">
      {parsed.success ? (
        <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm italic text-slate-600">
          {parsed.data.sentence}
        </p>
      ) : null}
      <textarea
        value={text}
        disabled={disabled}
        rows={2}
        placeholder={t("correctionPlaceholder")}
        onChange={(event) =>
          onChange({
            type: WorksheetQuestionType.ERROR_CORRECTION,
            text: event.target.value,
          })
        }
        className={cn(
          "w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          sheetInputClass,
        )}
      />
    </div>
  );
}

function SentenceReorderInput({ payload, value, onChange, disabled }: Props) {
  const parsed = sentenceReorderPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const chosen =
    value?.type === WorksheetQuestionType.SENTENCE_REORDER ? value.order : [];
  const remaining = [...parsed.data.tokens];
  for (const token of chosen) {
    const index = remaining.indexOf(token);
    if (index >= 0) remaining.splice(index, 1);
  }

  return (
    <div className="space-y-3">
      <div className="flex min-h-12 flex-wrap gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        {chosen.length === 0 ? (
          <span className="text-sm text-slate-400">…</span>
        ) : (
          chosen.map((token, index) => (
            <button
              key={`${token}-${index}`}
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange({
                  type: WorksheetQuestionType.SENTENCE_REORDER,
                  order: chosen.filter((_, i) => i !== index),
                })
              }
              className="rounded-full bg-[#1e3a5f] px-3 py-1 text-sm text-white"
            >
              {token}
            </button>
          ))
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {remaining.map((token, index) => (
          <button
            key={`${token}-rest-${index}`}
            type="button"
            disabled={disabled}
            onClick={() =>
              onChange({
                type: WorksheetQuestionType.SENTENCE_REORDER,
                order: [...chosen, token],
              })
            }
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm hover:border-[#1e3a5f]"
          >
            {token}
          </button>
        ))}
      </div>
    </div>
  );
}

function MatchingInput({ payload, value, onChange, disabled }: Props) {
  const parsed = matchingPayloadSchema.safeParse(payload);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  if (!parsed.success) return null;
  const pairs =
    value?.type === WorksheetQuestionType.MATCHING ? value.pairs : [];
  const usedLeft = new Set(pairs.map((p) => p.left));
  const usedRight = new Set(pairs.map((p) => p.right));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          {parsed.data.left.map((item) => (
            <button
              key={item}
              type="button"
              disabled={disabled || usedLeft.has(item)}
              onClick={() => setSelectedLeft(item)}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-left text-sm",
                selectedLeft === item
                  ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                  : "border-slate-300 bg-white",
                usedLeft.has(item) && "opacity-40",
              )}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {parsed.data.right.map((item) => (
            <button
              key={item}
              type="button"
              disabled={disabled || usedRight.has(item) || !selectedLeft}
              onClick={() => {
                if (!selectedLeft) return;
                onChange({
                  type: WorksheetQuestionType.MATCHING,
                  pairs: [...pairs, { left: selectedLeft, right: item }],
                });
                setSelectedLeft(null);
              }}
              className={cn(
                "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm",
                usedRight.has(item) && "opacity-40",
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      {pairs.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {pairs.map((pair) => (
            <button
              key={`${pair.left}-${pair.right}`}
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange({
                  type: WorksheetQuestionType.MATCHING,
                  pairs: pairs.filter(
                    (item) =>
                      !(item.left === pair.left && item.right === pair.right),
                  ),
                })
              }
              className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-900"
            >
              {pair.left} → {pair.right}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TrueFalseInput({ value, onChange, disabled }: Props) {
  const t = useTranslations("worksheets");
  const selected = value?.type === WorksheetQuestionType.TRUE_FALSE ? value : null;
  const picked = Boolean(selected && value?.type === WorksheetQuestionType.TRUE_FALSE);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onChange({
              type: WorksheetQuestionType.TRUE_FALSE,
              isTrue: true,
              justification: selected?.justification ?? "",
            })
          }
          className={cn(
            "rounded-md border px-4 py-2 text-sm",
            picked && selected?.isTrue
              ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
              : "border-slate-300 bg-white",
          )}
        >
          {t("trueLabel")}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onChange({
              type: WorksheetQuestionType.TRUE_FALSE,
              isTrue: false,
              justification: selected?.justification ?? "",
            })
          }
          className={cn(
            "rounded-md border px-4 py-2 text-sm",
            picked && selected && !selected.isTrue
              ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
              : "border-slate-300 bg-white",
          )}
        >
          {t("falseLabel")}
        </button>
      </div>
      <textarea
        value={selected?.justification ?? ""}
        disabled={disabled}
        rows={2}
        placeholder={t("justificationPlaceholder")}
        onChange={(event) => {
          if (!selected) return;
          onChange({
            type: WorksheetQuestionType.TRUE_FALSE,
            isTrue: selected.isTrue,
            justification: event.target.value,
          });
        }}
        className={cn(
          "w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          sheetInputClass,
        )}
      />
    </div>
  );
}

function ConjugationGridInput({ payload, value, onChange, disabled, targetLang }: Props) {
  const parsed = conjugationGridPayloadSchema.safeParse(payload);
  const profile = useMemo(
    () => getConjugationProfile(targetLang),
    [targetLang],
  );
  if (!parsed.success) return null;
  const cells =
    value?.type === WorksheetQuestionType.CONJUGATION_GRID
      ? value.cells
      : parsed.data.persons.map((personIndex) => ({ personIndex, form: "" }));
  const tenseLabel =
    profile?.tenses.find((tense) => tense.key === parsed.data.tenseKey)?.label ??
    parsed.data.tenseKey;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        {parsed.data.verb}
        <span className="mx-2 text-slate-300">·</span>
        {tenseLabel}
      </p>
      <div className="cahier-item overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {parsed.data.persons.map((personIndex) => {
              const label =
                profile?.persons.find((p) => p.index === personIndex)?.label ??
                String(personIndex);
              const cell = cells.find((c) => c.personIndex === personIndex);
              return (
                <tr key={personIndex} className="border-t first:border-t-0">
                  <td className="w-32 px-3 py-2 text-slate-500">{label}</td>
                  <td className="px-2 py-1">
                    <Input
                      value={cell?.form ?? ""}
                      disabled={disabled}
                      onChange={(event) => {
                        const next = parsed.data.persons.map((idx) => {
                          const existing = cells.find((c) => c.personIndex === idx);
                          return {
                            personIndex: idx,
                            form:
                              idx === personIndex
                                ? event.target.value
                                : (existing?.form ?? ""),
                          };
                        });
                        onChange({
                          type: WorksheetQuestionType.CONJUGATION_GRID,
                          cells: next,
                        });
                      }}
                      className={cn(sheetInputClass, "h-9")}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

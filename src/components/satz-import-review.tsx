"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  SatzPriority,
  SatzRegister,
  SatzSource,
} from "@prisma/client";
import { api, type RouterOutputs } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import { Progress } from "~/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";
import { getTargetLang, resolveImportTargetLang } from "~/lib/languages";
import { groupDomainsByKind } from "~/lib/domain-catalog";
import { cn } from "~/lib/utils";
import { Check, Loader2, Pencil, Search, X } from "lucide-react";

type BatchView = RouterOutputs["satzImport"]["getBatch"];
type DraftItem = BatchView["items"][number];

function errorDescription(
  message: string,
  tErrors: (key: "NOT_FOUND") => string,
) {
  const code = resolveErrorCode(message);
  return code ? tErrors(code as "NOT_FOUND") : message;
}

type FunnelStep = 1 | 2 | 3;
type ListFilter = "all" | "new" | "duplicates";
type FinishPhase = "idle" | "commit" | "audio" | "done";

function deriveFunnelStep(status: BatchView["status"]): FunnelStep {
  if (status === "COMMITTED") return 3;
  if (status === "ENRICHING" || status === "REVIEW") return 2;
  return 1;
}

function itemTranslation(item: DraftItem, lang: string): string {
  return item.translations.find((tr) => tr.lang === lang)?.text ?? "";
}

export function SatzImportReview({ batchId }: { batchId: string }) {
  const t = useTranslations("sentences");
  const tLang = useTranslations("languages");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const utils = api.useUtils();
  const enrichingRef = useRef(false);
  const [manualStep, setManualStep] = useState<FunnelStep | null>(null);
  const [enrichStarted, setEnrichStarted] = useState(false);
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [committing, setCommitting] = useState(false);
  const [finishPhase, setFinishPhase] = useState<FinishPhase>("idle");
  const [commitProgress, setCommitProgress] = useState({ done: 0, total: 0 });
  const [audioProgress, setAudioProgress] = useState({ done: 0, total: 0 });
  const [createdCount, setCreatedCount] = useState(0);

  const { data: batch, isLoading } = api.satzImport.getBatch.useQuery(
    { id: batchId },
    { refetchOnWindowFocus: false },
  );

  const enrichMutation = api.satzImport.enrichNext.useMutation();
  const commitMutation = api.satzImport.commit.useMutation();
  const requestAudio = api.satz.requestAudio.useMutation();
  const processAudio = api.satz.processAudio.useMutation();

  const step = manualStep ?? (batch ? deriveFunnelStep(batch.status) : 1);

  const startEnrich = async () => {
    setManualStep(2);
    setEnrichStarted(true);
    try {
      await enrichMutation.mutateAsync({ batchId, limit: 2 });
      await utils.satzImport.getBatch.invalidate({ id: batchId });
    } catch (error) {
      setEnrichStarted(false);
      setManualStep(null);
      toast({
        title: tToasts("satzImportEnrichError"),
        description:
          error instanceof Error
            ? errorDescription(error.message, tErrors)
            : undefined,
        variant: "destructive",
      });
    }
  };

  const handleFinish = async () => {
    if (!batch || batch.counts.ready === 0 || committing) return;
    setManualStep(3);
    setCommitting(true);
    setFinishPhase("commit");
    const createdIds: string[] = [];
    let remaining = batch.counts.ready;
    const total = remaining;
    setCommitProgress({ done: 0, total });
    try {
      while (remaining > 0) {
        const result = await commitMutation.mutateAsync({
          batchId,
          limit: 2,
        });
        createdIds.push(...result.createdIds);
        remaining = result.remaining;
        setCommitProgress({ done: total - remaining, total });
        await utils.satzImport.getBatch.invalidate({ id: batchId });
        if (result.createdCount === 0) break;
      }

      setCreatedCount(createdIds.length);
      void utils.satz.list.invalidate();

      const satzIds = [...new Set(createdIds)];
      if (satzIds.length > 0) {
        setFinishPhase("audio");
        const requested = await requestAudio.mutateAsync({
          satzIds,
          includeQuestions: true,
          langs: [resolveImportTargetLang(batch.targetLang)],
        });
        const audioTotal = requested.requested;
        setAudioProgress({ done: 0, total: audioTotal });
        let audioRemaining = audioTotal;
        let processed = 0;
        while (audioRemaining > 0) {
          const result = await processAudio.mutateAsync({ limit: 2 });
          processed += result.processed;
          audioRemaining = result.remaining;
          setAudioProgress({
            done: Math.min(processed, audioTotal),
            total: audioTotal,
          });
          if (result.processed === 0 && result.failed === 0) break;
        }
      }

      setFinishPhase("done");
      toast({
        title: tToasts("satzImportCommitted", { count: createdIds.length }),
      });
    } catch (error) {
      const duringAudio = audioProgress.total > 0;
      setManualStep(null);
      setFinishPhase("idle");
      toast({
        title: duringAudio
          ? tToasts("satzImportAudioError")
          : tToasts("satzImportCommitError"),
        description:
          error instanceof Error
            ? errorDescription(error.message, tErrors)
            : undefined,
        variant: "destructive",
      });
    } finally {
      setCommitting(false);
    }
  };

  useEffect(() => {
    if (!batch) return;
    if (enrichingRef.current) return;
    if (batch.status !== "ENRICHING") return;
    if (batch.counts.pending === 0) return;

    let cancelled = false;
    enrichingRef.current = true;

    const run = async () => {
      try {
        let remaining = batch.counts.pending;
        while (!cancelled && remaining > 0) {
          const result = await enrichMutation.mutateAsync({
            batchId,
            limit: 2,
          });
          remaining = result.remaining;
          await utils.satzImport.getBatch.invalidate({ id: batchId });
          if (result.processed === 0 && remaining > 0) break;
        }
      } catch (error) {
        if (!cancelled) {
          toast({
            title: tToasts("satzImportEnrichError"),
            description:
              error instanceof Error
                ? errorDescription(error.message, tErrors)
                : undefined,
            variant: "destructive",
          });
        }
      } finally {
        enrichingRef.current = false;
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // Continue enriching only while the batch is in the enrich step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, batch?.counts.pending, batch?.status]);

  if (isLoading || !batch) {
    return <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>;
  }

  const targetLang = resolveImportTargetLang(batch.targetLang);
  const targetMeta = getTargetLang(targetLang);
  const targetLabel = targetMeta ? tLang(targetMeta.code) : targetLang;
  const total = batch.counts.total || 1;
  const enrichDone = batch.counts.total - batch.counts.pending;
  const enrichPercent = Math.round((enrichDone / total) * 100);
  const commitPercent =
    commitProgress.total > 0
      ? Math.round((commitProgress.done / commitProgress.total) * 100)
      : 0;
  const audioPercent =
    audioProgress.total > 0
      ? Math.round((audioProgress.done / audioProgress.total) * 100)
      : finishPhase === "done"
        ? 100
        : 0;
  const enriching =
    batch.counts.pending > 0 &&
    (enrichStarted ||
      enrichMutation.isPending ||
      batch.status === "ENRICHING");
  const busy = enriching || committing;
  const doneCount =
    createdCount || batch.counts.committed || batch.counts.ready;

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-2 text-4xl font-bold">
            {step === 1
              ? t("importStep1Title")
              : step === 2
                ? t("importStep2Title")
                : t("importStep3Title")}
          </h1>
          <p className="text-muted-foreground">
            {step === 1
              ? t("importStep1Desc")
              : step === 2
                ? t("importStep2Desc")
                : t("importStep3Desc")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/sentences">{t("importBack")}</Link>
          </Button>
          {step === 1 ? (
            <Button
              disabled={batch.counts.total === 0 || enrichMutation.isPending}
              onClick={() => void startEnrich()}
            >
              {enrichMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t("importStep2Cta")}
            </Button>
          ) : null}
          {step === 2 ? (
            <Button
              disabled={batch.counts.ready === 0 || busy}
              onClick={() => void handleFinish()}
            >
              {committing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {batch.counts.ready === 0
                ? t("importCommitNone")
                : t("importStep3Cta")}
            </Button>
          ) : null}
        </div>
      </div>

      <FunnelStepper current={step} />

      {step === 1 ? (
        <Step1List
          items={batch.items}
          targetLang={targetLang}
          filter={listFilter}
          onFilterChange={setListFilter}
          counts={{
            total: batch.counts.total,
            new: batch.counts.new,
            duplicates: batch.counts.skippedDuplicate,
          }}
        />
      ) : null}

      {step === 2 ? (
        <>
          {enriching ? (
            <div className="cahier-item space-y-3 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("importEnriching")}
              </div>
              <Progress value={Math.max(enrichPercent, 4)} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("importCounts", {
                ready: batch.counts.ready,
                pending: batch.counts.pending,
                duplicates: batch.counts.skippedDuplicate,
                committed: batch.counts.committed,
              })}
            </p>
          )}
          <div className="space-y-4">
            {batch.items.map((item) => (
              <DraftCard
                key={`${item.id}-${item.status}`}
                batchId={batchId}
                item={item}
                targetLang={targetLang}
                targetLabel={targetLabel}
              />
            ))}
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <Step3Audio
          phase={finishPhase === "idle" && batch.status === "COMMITTED" ? "done" : finishPhase}
          commitPercent={commitPercent}
          audioPercent={audioPercent}
          audioProgress={audioProgress}
          createdCount={doneCount}
        />
      ) : null}
    </div>
  );
}

function FunnelStepper({ current }: { current: FunnelStep }) {
  const t = useTranslations("sentences");
  const steps: Array<{ id: FunnelStep; label: string }> = [
    { id: 1, label: t("importStep1") },
    { id: 2, label: t("importStep2") },
    { id: 3, label: t("importStep3") },
  ];

  return (
    <ol className="flex w-full items-start">
      {steps.map((item, index) => {
        const complete = item.id < current;
        const active = item.id === current;
        return (
          <Fragment key={item.id}>
            <li className="flex shrink-0 flex-col items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
                  complete && "bg-primary text-primary-foreground",
                  active && "bg-primary text-primary-foreground",
                  !complete && !active && "bg-muted text-muted-foreground",
                )}
              >
                {complete ? <Check className="h-4 w-4" /> : item.id}
              </div>
              <span
                className={cn(
                  "text-center text-sm",
                  active ? "font-medium" : "text-muted-foreground",
                )}
              >
                {item.label}
              </span>
            </li>
            {index < steps.length - 1 ? (
              <li
                aria-hidden
                className={cn(
                  "mt-4 h-px min-w-4 flex-1",
                  item.id < current ? "bg-primary" : "bg-border",
                )}
              />
            ) : null}
          </Fragment>
        );
      })}
    </ol>
  );
}

function Step1List({
  items,
  targetLang,
  filter,
  onFilterChange,
  counts,
}: {
  items: DraftItem[];
  targetLang: string;
  filter: ListFilter;
  onFilterChange: (filter: ListFilter) => void;
  counts: { total: number; new: number; duplicates: number };
}) {
  const t = useTranslations("sentences");
  const filtered = useMemo(() => {
    if (filter === "new") return items.filter((item) => !item.isDuplicate);
    if (filter === "duplicates") return items.filter((item) => item.isDuplicate);
    return items;
  }, [filter, items]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["all", t("importFilterAll"), counts.total],
            ["new", t("importFilterNew"), counts.new],
            ["duplicates", t("importFilterDuplicates"), counts.duplicates],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            onClick={() => onFilterChange(id)}
            className={cn(
              "cahier-item flex flex-col items-start gap-1 p-4 text-left",
              filter === id && "cahier-item-selected ring-2 ring-primary",
            )}
          >
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="text-2xl font-semibold">{count}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("importEmptyFilter")}</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const existing = item.duplicateCandidates[0];
            return (
              <div key={item.id} className="cahier-item space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    #{item.rowNumber}
                  </span>
                  {item.isDuplicate ? (
                    <Badge variant="destructive">{t("importDuplicate")}</Badge>
                  ) : (
                    <Badge>{t("importFilterNew")}</Badge>
                  )}
                </div>
                <p className="text-lg font-semibold">{item.mainText}</p>
                <p className="text-muted-foreground">
                  {itemTranslation(item, targetLang)}
                </p>
                {existing ? (
                  <p className="text-sm text-muted-foreground">
                    {t("importExistingSentence")}:{" "}
                    <Link
                      href={`/sentences/${existing.id}/edit`}
                      className="underline underline-offset-2"
                    >
                      {existing.mainText}
                    </Link>
                  </p>
                ) : item.error ? (
                  <p className="text-sm text-muted-foreground">{item.error}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Step3Audio({
  phase,
  commitPercent,
  audioPercent,
  audioProgress,
  createdCount,
}: {
  phase: FinishPhase;
  commitPercent: number;
  audioPercent: number;
  audioProgress: { done: number; total: number };
  createdCount: number;
}) {
  const t = useTranslations("sentences");

  if (phase === "done" || phase === "idle") {
    return (
      <div className="cahier-item space-y-4 p-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-4 w-4" />
          </div>
          <h2 className="text-2xl font-semibold">{t("importStep3Done")}</h2>
        </div>
        <p className="text-muted-foreground">
          {t("importStep3DoneDesc", { count: createdCount })}
        </p>
        <Button asChild>
          <Link href="/sentences">{t("importBack")}</Link>
        </Button>
      </div>
    );
  }

  const percent = phase === "audio" ? audioPercent : commitPercent;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {phase === "audio" ? t("importGeneratingAudio") : t("importCommitting")}
      </div>
      <Progress value={percent} />
      {phase === "audio" && audioProgress.total > 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("importAudioProgress", {
            done: audioProgress.done,
            total: audioProgress.total,
          })}
        </p>
      ) : null}
    </div>
  );
}

function DraftCard({
  batchId,
  item,
  targetLang,
  targetLabel,
}: {
  batchId: string;
  item: DraftItem;
  targetLang: string;
  targetLabel: string;
}) {
  const t = useTranslations("sentences");
  const tDomains = useTranslations("domains");
  const tCommon = useTranslations("common");
  const utils = api.useUtils();
  const updateMutation = api.satzImport.updateDraft.useMutation({
    onSuccess: () => {
      void utils.satzImport.getBatch.invalidate({ id: batchId });
    },
  });

  const { data: domains } = api.domain.list.useQuery();
  const [entryQuery, setEntryQuery] = useState("");
  const entrySearch = api.entry.search.useQuery(
    { query: entryQuery, limit: 8 },
    { enabled: entryQuery.trim().length > 0 },
  );

  const [mainText, setMainText] = useState(item.mainText);
  const [adjustedSource, setAdjustedSource] = useState(item.adjustedSource);
  const [editingMainText, setEditingMainText] = useState(false);
  const [skip, setSkip] = useState(item.skip);
  const [allowSimilar, setAllowSimilar] = useState(item.allowSimilar);
  const [trigger, setTrigger] = useState(item.trigger ?? "");
  const [source, setSource] = useState(item.source);
  const [priority, setPriority] = useState(item.priority);
  const [register, setRegister] = useState(item.register);
  const [domainIds, setDomainIds] = useState(item.domainIds);
  const [linkedEntries, setLinkedEntries] = useState(item.linkedEntries);
  const [isAnswer, setIsAnswer] = useState(item.isAnswer);
  const [answerToId, setAnswerToId] = useState(item.answerToId);
  const [suggestedQuestion, setSuggestedQuestion] = useState(
    item.suggestedQuestionText ?? "",
  );
  const [translations, setTranslations] = useState<
    Record<string, { text: string; register: SatzRegister }>
  >(() => {
    const match = item.translations.find((tr) => tr.lang === targetLang);
    return {
      [targetLang]: {
        text: match?.text ?? "",
        register: match?.register ?? item.register,
      },
    };
  });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = (payload: Parameters<typeof updateMutation.mutate>[0]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateMutation.mutate(payload);
    }, 400);
  };

  const locked =
    item.status === "COMMITTED" ||
    item.status === "PENDING" ||
    item.status === "ERROR";

  const assignable = groupDomainsByKind(
    (domains ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      kind: d.kind,
    })),
  ).filter((group) => group.kind === "THEME" || group.kind === "SPECIAL");

  const statusLabel =
    item.status === "COMMITTED"
      ? t("importStatusCOMMITTED_ITEM")
      : t(`importStatus${item.status}`);

  return (
    <div className="cahier-item space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">#{item.rowNumber}</span>
          <Badge variant="outline">{statusLabel}</Badge>
          {item.ready ? <Badge>{t("importReady")}</Badge> : null}
          {item.isDuplicate ? (
            <Badge variant="destructive">{t("importDuplicate")}</Badge>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={skip}
            disabled={item.status === "COMMITTED"}
            onCheckedChange={(checked) => {
              const next = checked === true;
              setSkip(next);
              updateMutation.mutate({ id: item.id, skip: next });
            }}
          />
          {t("importSkip")}
        </label>
      </div>

      {editingMainText && item.status !== "COMMITTED" ? (
        <Input
          id={`draft-main-${item.id}`}
          className="w-full text-lg font-semibold"
          value={mainText}
          autoFocus
          onChange={(e) => {
            const next = e.target.value;
            setMainText(next);
            if (next.trim()) {
              persist({ id: item.id, mainText: next });
            }
          }}
          onBlur={() => {
            if (mainText.trim()) setEditingMainText(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && mainText.trim()) {
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              setMainText(item.mainText);
              setEditingMainText(false);
            }
          }}
          placeholder={t("mainTextPlaceholder")}
        />
      ) : (
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-lg font-semibold">{mainText}</p>
          {item.status !== "COMMITTED" ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setEditingMainText(true)}
              aria-label={tCommon("edit")}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      )}
      {item.error ? (
        <p className="text-sm text-destructive">{item.error}</p>
      ) : null}

      {adjustedSource && item.status !== "COMMITTED" ? (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <div className="font-medium">{t("importDriftTitle")}</div>
          <p className="text-muted-foreground">{t("importDriftHint")}</p>
          <p className="font-semibold">{adjustedSource}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setMainText(adjustedSource);
                setAdjustedSource(null);
                updateMutation.mutate({
                  id: item.id,
                  mainText: adjustedSource,
                  adjustedSource: null,
                });
              }}
            >
              {t("importDriftApply")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setAdjustedSource(null);
                updateMutation.mutate({ id: item.id, adjustedSource: null });
              }}
            >
              {t("importDriftDismiss")}
            </Button>
          </div>
        </div>
      ) : null}

      {item.isDuplicate ? (
        <div className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm">
          <div className="font-medium">
            {item.duplicateCandidates.some((c) => c.score >= 1)
              ? t("importExactDuplicate")
              : t("importDuplicate")}
          </div>
          {item.duplicateCandidates.length > 0 ? (
            <ul className="space-y-1 text-muted-foreground">
              {item.duplicateCandidates.map((c) => (
                <li key={c.id}>
                  {c.mainText}{" "}
                  <span className="text-xs">({c.score.toFixed(2)})</span>
                </li>
              ))}
            </ul>
          ) : null}
          <label className="flex items-center gap-2">
            <Checkbox
              checked={allowSimilar}
              disabled={item.status === "COMMITTED"}
              onCheckedChange={(checked) => {
                const next = checked === true;
                setAllowSimilar(next);
                updateMutation.mutate({ id: item.id, allowSimilar: next });
              }}
            />
            {t("importAllowSimilar")}
          </label>
        </div>
      ) : null}

      <div className="space-y-3">
        <h3 className="font-medium">{t("translationsTitle")}</h3>
        {(() => {
          const draft = translations[targetLang];
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{targetLang.toUpperCase()}</Badge>
                <span className="text-sm">{targetLabel}</span>
              </div>
              <Input
                value={draft?.text ?? ""}
                disabled={locked && item.status !== "SKIPPED_DUPLICATE"}
                onChange={(e) => {
                  const text = e.target.value;
                  const next = {
                    ...translations,
                    [targetLang]: {
                      text,
                      register: draft?.register ?? register,
                    },
                  };
                  setTranslations(next);
                  persist({
                    id: item.id,
                    translations: [
                      {
                        lang: targetLang,
                        text: next[targetLang]?.text ?? "",
                        register: next[targetLang]?.register ?? register,
                      },
                    ].filter((tr) => tr.text.trim().length > 0),
                  });
                }}
                placeholder={t("translationPlaceholder", {
                  language: targetLabel,
                })}
              />
            </div>
          );
        })()}
      </div>

      {item.status === "ENRICHED" ||
      (item.status === "SKIPPED_DUPLICATE" && allowSimilar) ? (
        <>
          <div className="space-y-3">
            <h3 className="font-medium">{t("answerToTitle")}</h3>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={isAnswer}
                onCheckedChange={(checked) => {
                  const next = checked === true;
                  setIsAnswer(next);
                  if (!next) {
                    setAnswerToId(null);
                    setSuggestedQuestion("");
                    persist({
                      id: item.id,
                      isAnswer: false,
                      answerToId: null,
                      suggestedQuestionText: null,
                    });
                  } else {
                    persist({ id: item.id, isAnswer: true });
                  }
                }}
              />
              {t("importIsAnswer")}
            </label>
            {isAnswer ? (
              <>
                {item.questionCandidates.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {item.questionCandidates.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => {
                          setAnswerToId(candidate.id);
                          persist({
                            id: item.id,
                            isAnswer: true,
                            answerToId: candidate.id,
                          });
                        }}
                      >
                        <Badge
                          variant={
                            answerToId === candidate.id ? "default" : "outline"
                          }
                        >
                          {candidate.mainText}
                        </Badge>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label>{t("importNewQuestion")}</Label>
                  <Input
                    value={suggestedQuestion}
                    onChange={(e) => {
                      const next = e.target.value;
                      setSuggestedQuestion(next);
                      persist({
                        id: item.id,
                        isAnswer: true,
                        suggestedQuestionText: next,
                        answerToId: answerToId,
                      });
                    }}
                    placeholder={t("importNewQuestionPlaceholder")}
                  />
                  {item.answerTo && answerToId === item.answerTo.id ? (
                    <p className="text-sm text-muted-foreground">
                      {t("answerToPrefix")}: {item.answerTo.mainText}
                    </p>
                  ) : null}
                </div>
                {answerToId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAnswerToId(null);
                      persist({ id: item.id, answerToId: null });
                    }}
                  >
                    {t("answerToUnlink")}
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>{t("sourceLabel")}</Label>
              <Select
                value={source}
                onValueChange={(value) => {
                  const next = value as SatzSource;
                  setSource(next);
                  updateMutation.mutate({ id: item.id, source: next });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERSONAL">{t("sourcePERSONAL")}</SelectItem>
                  <SelectItem value="GENERIC">{t("sourceGENERIC")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("priorityLabel")}</Label>
              <Select
                value={priority}
                onValueChange={(value) => {
                  const next = value as SatzPriority;
                  setPriority(next);
                  updateMutation.mutate({ id: item.id, priority: next });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["DAILY", "WEEKLY", "OCCASIONAL", "RARE"] as const).map(
                    (value) => (
                      <SelectItem key={value} value={value}>
                        {t(`priority${value}`)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("registerINFORMAL").split(" ")[0]}</Label>
              <Select
                value={register}
                onValueChange={(value) => {
                  const next = value as SatzRegister;
                  setRegister(next);
                  const nextTranslations = Object.fromEntries(
                    Object.entries(translations).map(([lang, draft]) => [
                      lang,
                      { ...draft, register: next },
                    ]),
                  );
                  setTranslations(nextTranslations);
                  persist({
                    id: item.id,
                    register: next,
                    translations: [
                      {
                        lang: targetLang,
                        text: nextTranslations[targetLang]?.text ?? "",
                        register: next,
                      },
                    ].filter((tr) => tr.text.trim().length > 0),
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INFORMAL">{t("registerINFORMAL")}</SelectItem>
                  <SelectItem value="FORMAL">{t("registerFORMAL")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("triggerLabel")}</Label>
            <Input
              value={trigger}
              onChange={(e) => {
                const next = e.target.value;
                setTrigger(next);
                persist({ id: item.id, trigger: next });
              }}
              placeholder={t("triggerPlaceholder")}
            />
          </div>

          <div className="space-y-3">
            <h3 className="font-medium">{t("domainsTitle")}</h3>
            {assignable.map((group) => (
              <div key={group.kind} className="space-y-2">
                <div className="text-sm font-semibold text-muted-foreground">
                  {tDomains(`kind${group.kind}`)}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.domains.map((domain) => (
                    <label
                      key={domain.id}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={domainIds.includes(domain.id)}
                        onCheckedChange={() => {
                          const next = domainIds.includes(domain.id)
                            ? domainIds.filter((id) => id !== domain.id)
                            : [...domainIds, domain.id];
                          setDomainIds(next);
                          persist({ id: item.id, domainIds: next });
                        }}
                      />
                      <span>{domain.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <h3 className="font-medium">{t("entriesTitle")}</h3>
            {item.vocabCandidates.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {item.vocabCandidates.map((candidate) => {
                  const selected = linkedEntries.some((e) => e.id === candidate.id);
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      className="text-left"
                      onClick={() => {
                        const next = selected
                          ? linkedEntries.filter((e) => e.id !== candidate.id)
                          : [
                              ...linkedEntries,
                              { id: candidate.id, mainText: candidate.mainText },
                            ];
                        setLinkedEntries(next);
                        persist({
                          id: item.id,
                          linkedEntryIds: next.map((e) => e.id),
                        });
                      }}
                    >
                      <Badge variant={selected ? "default" : "outline"}>
                        {candidate.mainText}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("importVocabSuggested")}: —
              </p>
            )}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={entryQuery}
                onChange={(e) => setEntryQuery(e.target.value)}
                placeholder={t("entriesSearch")}
              />
            </div>
            {entrySearch.data?.entries?.length ? (
              <div className="space-y-1">
                {entrySearch.data.entries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="cahier-item cahier-item-hover w-full p-2 text-left text-sm"
                    onClick={() => {
                      if (linkedEntries.some((e) => e.id === entry.id)) return;
                      const next = [
                        ...linkedEntries,
                        { id: entry.id, mainText: entry.mainText },
                      ];
                      setLinkedEntries(next);
                      persist({
                        id: item.id,
                        linkedEntryIds: next.map((e) => e.id),
                      });
                      setEntryQuery("");
                    }}
                  >
                    {entry.mainText}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {linkedEntries.map((entry) => (
                <Badge key={entry.id} variant="secondary" className="gap-1">
                  {entry.mainText}
                  <button
                    type="button"
                    onClick={() => {
                      const next = linkedEntries.filter((e) => e.id !== entry.id);
                      setLinkedEntries(next);
                      persist({
                        id: item.id,
                        linkedEntryIds: next.map((e) => e.id),
                      });
                    }}
                    aria-label={tCommon("delete")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

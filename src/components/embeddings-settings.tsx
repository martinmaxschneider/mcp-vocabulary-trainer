"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Progress } from "~/components/ui/progress";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";
import { Loader2, Search, Sparkles } from "lucide-react";

function EmbeddingSection({
  kind,
  status,
  backfilling,
  onBackfill,
  probe,
  setProbe,
  onProbe,
  probePending,
  probeData,
  probeError,
}: {
  kind: "entries" | "saetze";
  status?: {
    total: number;
    withEmbedding: number;
    missing: number;
    threshold: number;
  };
  backfilling: boolean;
  onBackfill: () => void;
  probe: string;
  setProbe: (value: string) => void;
  onProbe: () => void;
  probePending: boolean;
  probeData?: { candidates: Array<{ id: string; mainText: string; score: number }> };
  probeError?: string;
}) {
  const t = useTranslations("settings");
  const tErrors = useTranslations("errors.codes");
  const total = status?.total ?? 0;
  const done = status?.withEmbedding ?? 0;
  const percent = total > 0 ? Math.round((done / total) * 100) : 100;
  const missing = status?.missing ?? 0;
  const prefix = kind === "entries" ? "embeddings" : "embeddingsSatz";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {t(`${prefix}Status` as "embeddingsStatus", { done, total })}
          </span>
          <Badge variant="outline">
            {status
              ? t("embeddingsThreshold", {
                  threshold: Math.round(status.threshold * 100),
                })
              : "—"}
          </Badge>
        </div>
        <Progress value={percent} className="h-2" />
        {missing === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t(`${prefix}Done` as "embeddingsDone")}
          </p>
        ) : (
          <Button type="button" onClick={onBackfill} disabled={backfilling}>
            {backfilling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("embeddingsBackfilling")}
              </>
            ) : (
              t(`${prefix}Backfill` as "embeddingsBackfill")
            )}
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium" htmlFor={`embedding-probe-${kind}`}>
          {t(`${prefix}ProbeLabel` as "embeddingsProbeLabel")}
        </label>
        <div className="flex flex-wrap gap-2">
          <Input
            id={`embedding-probe-${kind}`}
            value={probe}
            onChange={(event) => setProbe(event.target.value)}
            placeholder={t(
              `${prefix}ProbePlaceholder` as "embeddingsProbePlaceholder",
            )}
            className="max-w-sm"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onProbe();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={onProbe}
            disabled={probePending || !probe.trim()}
          >
            {probePending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            {t("embeddingsProbeButton")}
          </Button>
        </div>
        {probeData ? (
          probeData.candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t(`${prefix}ProbeEmpty` as "embeddingsProbeEmpty")}
            </p>
          ) : (
            <ul className="cahier-section space-y-2">
              {probeData.candidates.map((candidate) => (
                <li
                  key={candidate.id}
                  className="cahier-item flex items-center justify-between p-3"
                >
                  <span className="font-medium">{candidate.mainText}</span>
                  <Badge variant="outline">
                    {Math.round(candidate.score * 100)}%
                  </Badge>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {probeError ? (
          <p className="text-sm text-destructive">
            {resolveErrorCode(probeError)
              ? tErrors(resolveErrorCode(probeError) as "NOT_FOUND")
              : probeError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function EmbeddingsSettings() {
  const t = useTranslations("settings");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const utils = api.useUtils();

  const [entryProbe, setEntryProbe] = useState("");
  const [satzProbe, setSatzProbe] = useState("");
  const [backfillingEntries, setBackfillingEntries] = useState(false);
  const [backfillingSaetze, setBackfillingSaetze] = useState(false);

  const { data: entryStatus } = api.entry.embeddingStatus.useQuery();
  const { data: satzStatus } = api.satz.embeddingStatus.useQuery();
  const entryBackfill = api.entry.backfillEmbeddings.useMutation();
  const satzBackfill = api.satz.backfillEmbeddings.useMutation();
  const findEntries = api.entry.findSimilar.useMutation();
  const findSaetze = api.satz.findSimilar.useMutation();

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrors(code as "NOT_FOUND") : message;
  };

  const runBackfill = async (
    kind: "entries" | "saetze",
    missing: number,
    mutate: (input: { limit: number }) => Promise<{ remaining: number; processed: number }>,
    invalidate: () => Promise<unknown>,
  ) => {
    if (kind === "entries") setBackfillingEntries(true);
    else setBackfillingSaetze(true);
    try {
      let remaining = missing || 1;
      while (remaining > 0) {
        const result = await mutate({ limit: 50 });
        remaining = result.remaining;
        await invalidate();
        if (result.processed === 0) break;
      }
      toast({ title: tToasts("embeddingsBackfillDone") });
    } catch (error) {
      toast({
        title: tToasts("embeddingsBackfillError"),
        description:
          error instanceof Error ? errorDescription(error.message) : undefined,
        variant: "destructive",
      });
    } finally {
      if (kind === "entries") setBackfillingEntries(false);
      else setBackfillingSaetze(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          <CardTitle>{t("embeddingsTitle")}</CardTitle>
        </div>
        <CardDescription>{t("embeddingsDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="space-y-3">
          <h3 className="font-medium">{t("embeddingsEntriesTitle")}</h3>
          <EmbeddingSection
            kind="entries"
            status={entryStatus}
            backfilling={backfillingEntries}
            onBackfill={() =>
              void runBackfill(
                "entries",
                entryStatus?.missing ?? 1,
                (input) => entryBackfill.mutateAsync(input),
                () => utils.entry.embeddingStatus.invalidate(),
              )
            }
            probe={entryProbe}
            setProbe={setEntryProbe}
            onProbe={() => {
              const query = entryProbe.trim();
              if (query) findEntries.mutate({ query, limit: 5 });
            }}
            probePending={findEntries.isPending}
            probeData={findEntries.data}
            probeError={findEntries.error?.message}
          />
        </div>

        <div className="space-y-3 border-t border-border/60 pt-6">
          <h3 className="font-medium">{t("embeddingsSaetzeTitle")}</h3>
          <EmbeddingSection
            kind="saetze"
            status={satzStatus}
            backfilling={backfillingSaetze}
            onBackfill={() =>
              void runBackfill(
                "saetze",
                satzStatus?.missing ?? 1,
                (input) => satzBackfill.mutateAsync(input),
                () => utils.satz.embeddingStatus.invalidate(),
              )
            }
            probe={satzProbe}
            setProbe={setSatzProbe}
            onProbe={() => {
              const query = satzProbe.trim();
              if (query) findSaetze.mutate({ query, limit: 5 });
            }}
            probePending={findSaetze.isPending}
            probeData={findSaetze.data}
            probeError={findSaetze.error?.message}
          />
        </div>

        <p className="text-sm text-muted-foreground">{t("embeddingsHelp")}</p>
      </CardContent>
    </Card>
  );
}

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

export function EmbeddingsSettings() {
  const t = useTranslations("settings");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const utils = api.useUtils();

  const [probe, setProbe] = useState("");
  const [backfilling, setBackfilling] = useState(false);

  const { data: status } = api.entry.embeddingStatus.useQuery();
  const backfillMutation = api.entry.backfillEmbeddings.useMutation();
  const findSimilarMutation = api.entry.findSimilar.useMutation();

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrors(code as "NOT_FOUND") : message;
  };

  const handleBackfill = async () => {
    setBackfilling(true);
    try {
      let remaining = status?.missing ?? 1;
      while (remaining > 0) {
        const result = await backfillMutation.mutateAsync({ limit: 50 });
        remaining = result.remaining;
        await utils.entry.embeddingStatus.invalidate();
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
      setBackfilling(false);
    }
  };

  const handleProbe = () => {
    const query = probe.trim();
    if (!query) return;
    findSimilarMutation.mutate({ query, limit: 5 });
  };

  const total = status?.total ?? 0;
  const done = status?.withEmbedding ?? 0;
  const percent = total > 0 ? Math.round((done / total) * 100) : 100;
  const missing = status?.missing ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          <CardTitle>{t("embeddingsTitle")}</CardTitle>
        </div>
        <CardDescription>{t("embeddingsDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {t("embeddingsStatus", { done, total })}
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
            <p className="text-sm text-muted-foreground">{t("embeddingsDone")}</p>
          ) : (
            <Button
              type="button"
              onClick={() => void handleBackfill()}
              disabled={backfilling}
            >
              {backfilling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("embeddingsBackfilling")}
                </>
              ) : (
                t("embeddingsBackfill")
              )}
            </Button>
          )}
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium" htmlFor="embedding-probe">
            {t("embeddingsProbeLabel")}
          </label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="embedding-probe"
              value={probe}
              onChange={(event) => setProbe(event.target.value)}
              placeholder={t("embeddingsProbePlaceholder")}
              className="max-w-sm"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleProbe();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleProbe}
              disabled={findSimilarMutation.isPending || !probe.trim()}
            >
              {findSimilarMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              {t("embeddingsProbeButton")}
            </Button>
          </div>
          {findSimilarMutation.data ? (
            findSimilarMutation.data.candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("embeddingsProbeEmpty")}
              </p>
            ) : (
              <ul className="cahier-section space-y-2">
                {findSimilarMutation.data.candidates.map((candidate) => (
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
          {findSimilarMutation.isError ? (
            <p className="text-sm text-destructive">
              {errorDescription(findSimilarMutation.error.message)}
            </p>
          ) : null}
        </div>

        <p className="text-sm text-muted-foreground">{t("embeddingsHelp")}</p>
      </CardContent>
    </Card>
  );
}

"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { BookOpen, Dumbbell, Headphones, Loader2, Pencil, Plus, Trash2, Upload, Volume2 } from "lucide-react";
import { SatzAudioButton } from "~/components/satz-audio-button";
import { Checkbox } from "~/components/ui/checkbox";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";
import { playbackUrls } from "~/lib/satz-tts";
import { SOURCE_LANG } from "~/lib/languages";
import { useFocusLang } from "~/components/focus-lang-provider";

function SentencesPageInner() {
  const searchParams = useSearchParams();
  const domainId = searchParams.get("domainId") ?? undefined;
  const t = useTranslations("sentences");
  const tLang = useTranslations("languages");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const { focusLang } = useFocusLang();
  const [query, setQuery] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatingBulk, setGeneratingBulk] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const utils = api.useUtils();

  const { data, isLoading } = api.satz.list.useQuery({
    ...(query.trim() ? { query: query.trim() } : {}),
    ...(domainId ? { domainId } : {}),
    limit: 100,
  });

  const requestAudio = api.satz.requestAudio.useMutation();
  const processAudio = api.satz.processAudio.useMutation();

  const generateAudio = async (params: {
    satzIds: string[];
    includeQuestions: boolean;
    regenerate?: boolean;
  }) => {
    const { satzIds, includeQuestions, regenerate } = params;
    if (satzIds.length === 0) return;
    if (satzIds.length === 1) setGeneratingId(satzIds[0] ?? null);
    else setGeneratingBulk(true);
    try {
      const requested = await requestAudio.mutateAsync({
        satzIds,
        includeQuestions,
        langs: [focusLang],
        regenerate,
      });
      let remaining = requested.requested;
      while (remaining > 0) {
        const result = await processAudio.mutateAsync({ limit: 2 });
        remaining = result.remaining;
        await utils.satz.list.invalidate();
        if (result.processed === 0 && result.failed === 0) break;
      }
      toast({ title: tToasts("satzAudioDone") });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const code = resolveErrorCode(message);
      toast({
        title: tToasts("satzAudioError"),
        description: code ? tErrors(code as "NOT_FOUND") : message || undefined,
        variant: "destructive",
      });
    } finally {
      setGeneratingId(null);
      setGeneratingBulk(false);
    }
  };

  const deleteMutation = api.satz.delete.useMutation({
    onSuccess: (_data, variables) => {
      toast({ title: tToasts("satzDeleted") });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(variables.id);
        return next;
      });
      void utils.satz.list.invalidate();
    },
    onError: (error) => {
      toast({
        title: tToasts("satzDeleteError"),
        description: resolveErrorCode(error.message)
          ? tErrors(resolveErrorCode(error.message) as "NOT_FOUND")
          : error.message,
        variant: "destructive",
      });
    },
  });

  const deleteManyMutation = api.satz.deleteMany.useMutation({
    onSuccess: (data) => {
      toast({ title: tToasts("satzDeletedMany", { count: data.deleted }) });
      setSelected(new Set());
      void utils.satz.list.invalidate();
    },
    onError: (error) => {
      toast({
        title: tToasts("satzDeleteError"),
        description: resolveErrorCode(error.message)
          ? tErrors(resolveErrorCode(error.message) as "NOT_FOUND")
          : error.message,
        variant: "destructive",
      });
    },
  });

  const items = data?.items ?? [];
  const allSelected = items.length > 0 && items.every((satz) => selected.has(satz.id));
  const someSelected = items.some((satz) => selected.has(satz.id));
  const deleting = deleteMutation.isPending || deleteManyMutation.isPending;
  const busy = deleting || generatingBulk;

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(items.map((satz) => satz.id)) : new Set());
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-2 text-4xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/sentences/review">
              <BookOpen className="mr-2 h-4 w-4" />
              {t("review")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sentences/listen">
              <Headphones className="mr-2 h-4 w-4" />
              {t("listen")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sentences/import">
              <Upload className="mr-2 h-4 w-4" />
              {t("import")}
            </Link>
          </Button>
          <Button asChild>
            <Link href={domainId ? `/sentences/new?domainId=${domainId}` : "/sentences/new"}>
              <Plus className="mr-2 h-4 w-4" />
              {t("add")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Input
          className="max-w-md"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
        />
        {items.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => toggleAll(checked === true)}
              />
              {allSelected ? tCommon("deselectAll") : tCommon("selectAll")}
            </label>
            {selected.size > 0 ? (
              <>
                <span className="text-sm text-muted-foreground">
                  {t("selectedCount", { count: selected.size })}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm(t("confirmRegenerateAudio", { count: selected.size }))) {
                      return;
                    }
                    const includeQuestions = items.some(
                      (satz) => selected.has(satz.id) && Boolean(satz.answerTo),
                    );
                    void generateAudio({
                      satzIds: [...selected],
                      includeQuestions,
                      regenerate: true,
                    });
                  }}
                >
                  {generatingBulk ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Volume2 className="mr-2 h-4 w-4" />
                  )}
                  {t("regenerateAudio")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(t("confirmDeleteMany", { count: selected.size }))) {
                      deleteManyMutation.mutate({ ids: [...selected] });
                    }
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("deleteSelected")}
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
      ) : data?.items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("emptyTitle")}</CardTitle>
            <CardDescription>{t("emptyDesc")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {data?.items.map((satz) => {
            const translation = satz.translations.find(
              (tr) => tr.lang === focusLang,
            );
            const mainClips = playbackUrls({
              mainUrl: satz.mainAudioUrl,
              mainStatus: satz.mainAudioStatus,
              mainUpdatedAt: satz.updatedAt,
            });
            const translationClips = playbackUrls({
              translationUrl: translation?.audioUrl,
              translationStatus: translation?.audioStatus,
              translationUpdatedAt: translation?.updatedAt,
            });
            return (
              <Card key={satz.id}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      className="mt-1"
                      checked={selected.has(satz.id)}
                      onCheckedChange={() => toggleSelected(satz.id)}
                      aria-label={satz.mainText}
                    />
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{satz.mainText}</CardTitle>
                      {translation ? (
                        <CardDescription>{translation.text}</CardDescription>
                      ) : null}
                      {satz.trigger ? (
                        <p className="text-sm text-muted-foreground">
                          {t("triggerPrefix")}: {satz.trigger}
                        </p>
                      ) : null}
                      {satz.answerTo ? (
                        <p className="text-sm text-muted-foreground">
                          {t("answerToPrefix")}: {satz.answerTo.mainText}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {satz.domains.map((link) => (
                          <Badge key={link.id} variant="outline">
                            {link.domain.name}
                          </Badge>
                        ))}
                        {satz.linkedEntries.map((link) => (
                          <Badge key={link.id} variant="secondary">
                            {link.entry.mainText}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <SatzAudioButton
                      urls={mainClips}
                      langCode={SOURCE_LANG.code}
                      label={t("playAudioLang", {
                        language: tLang(SOURCE_LANG.code),
                      })}
                    />
                    <SatzAudioButton
                      urls={translationClips}
                      langCode={focusLang}
                      label={t("playAudioLang", {
                        language: tLang(focusLang),
                      })}
                    />
                    {mainClips.length === 0 || translationClips.length === 0 ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={t("generateAudio")}
                        title={t("generateAudio")}
                        disabled={!translation || generatingId === satz.id || generatingBulk}
                        onClick={() =>
                          void generateAudio({
                            satzIds: [satz.id],
                            includeQuestions: Boolean(satz.answerTo),
                          })
                        }
                      >
                        {generatingId === satz.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </Button>
                    ) : null}
                    <Button asChild size="icon" variant="ghost">
                      <Link href={`/sentences/${satz.id}/train`} aria-label={t("train")}>
                        <Dumbbell className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button asChild size="icon" variant="ghost">
                      <Link href={`/sentences/${satz.id}/edit`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(t("confirmDelete"))) {
                          deleteMutation.mutate({ id: satz.id });
                        }
                      }}
                      disabled={busy}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground">
                  {t(`source${satz.source}`)} · {t(`priority${satz.priority}`)}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SentencesPage() {
  const tCommon = useTranslations("common");
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">{tCommon("loading")}</p>}>
      <SentencesPageInner />
    </Suspense>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Download, Loader2 } from "lucide-react";
import { DailyPackageStatus } from "@prisma/client";
import { api } from "~/trpc/client";
import { ListenSession } from "~/components/listen-session";
import { Button } from "~/components/ui/button";
import { Progress } from "~/components/ui/progress";
import { useFocusLang } from "~/components/focus-lang-provider";
import { useToast } from "~/hooks/use-toast";
import { TARGET_LANGS } from "~/lib/languages";
import { toDailyListenItem } from "~/lib/daily-listen";
import {
  hydrateOfflineItems,
  loadOfflineDaily,
  revokeBlobUrls,
  saveDailyOffline,
  type OfflineDailyRecord,
} from "~/lib/offline-daily";
import { cn } from "~/lib/utils";

function formatDailyDate(date: string, locale: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function canStorePackage(pkg: {
  status: string;
  items: Array<{ clips: Array<{ url: string }> }>;
}): boolean {
  return (
    (pkg.status === DailyPackageStatus.ACTIVE ||
      pkg.status === DailyPackageStatus.TESTING) &&
    pkg.items.some((item) => item.clips.length > 0)
  );
}

export function DailyPwa() {
  const t = useTranslations("daily");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("languages");
  const tToasts = useTranslations("toasts");
  const locale = useLocale();
  const { focusLang, setFocusLang } = useFocusLang();
  const { toast } = useToast();
  const utils = api.useUtils();

  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [record, setRecord] = useState<OfflineDailyRecord | null>(null);
  const [hydrated, setHydrated] = useState<OfflineDailyRecord["items"] | null>(
    null,
  );
  const blobUrlsRef = useRef<string[]>([]);

  const applyRecord = useCallback(async (stored: OfflineDailyRecord | null) => {
    revokeBlobUrls(blobUrlsRef.current);
    blobUrlsRef.current = [];
    if (!stored) {
      setRecord(null);
      setHydrated(null);
      return;
    }
    const result = await hydrateOfflineItems(stored.items);
    blobUrlsRef.current = result.blobUrls;
    setRecord(stored);
    setHydrated(result.items);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadOfflineDaily();
      if (cancelled) return;
      await applyRecord(stored);
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
      revokeBlobUrls(blobUrlsRef.current);
      blobUrlsRef.current = [];
    };
  }, [applyRecord]);

  const items = useMemo(
    () => (hydrated ?? []).map(toDailyListenItem),
    [hydrated],
  );

  const download = async () => {
    setSaving(true);
    setProgress({ done: 0, total: 0 });
    try {
      const data = await utils.daily.today.fetch({ targetLang: focusLang });
      const pkg = data.package;
      if (!pkg || !canStorePackage(pkg)) {
        toast({
          title: t("pwaNeedActive"),
          variant: "destructive",
        });
        return;
      }
      const saved = await saveDailyOffline(
        {
          id: pkg.id,
          date: pkg.date,
          targetLang: pkg.targetLang,
          items: pkg.items,
        },
        (done, total) => setProgress({ done, total }),
      );
      await applyRecord(saved);
      toast({ title: tToasts("dailyOfflineSaved") });
    } catch (error) {
      toast({
        title: tToasts("dailyOfflineError"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <header className="sticky top-0 z-10 space-y-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t("pwaLangLabel")}
          </p>
          <div className="flex flex-wrap gap-2">
            {TARGET_LANGS.map((lang) => (
              <Button
                key={lang.code}
                type="button"
                size="sm"
                variant={focusLang === lang.code ? "default" : "outline"}
                className="min-h-10 px-3 [touch-action:manipulation]"
                onClick={() => setFocusLang(lang.code)}
              >
                <span aria-hidden className="mr-1.5">
                  {lang.flag}
                </span>
                {tLang(lang.code)}
              </Button>
            ))}
          </div>
        </div>
        <Button
          className="h-12 w-full [touch-action:manipulation]"
          onClick={() => void download()}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {saving ? t("savingOffline") : t("pwaDownload")}
        </Button>
        {saving && progress ? (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {t("offlineProgress", progress)}
            </p>
            <Progress
              value={
                progress.total > 0 ? (progress.done / progress.total) * 100 : 0
              }
            />
          </div>
        ) : null}
        {record ? (
          <p className="text-xs text-muted-foreground">
            {t("offlineHint", { date: formatDailyDate(record.date, locale) })}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("pwaEmptyHint")}</p>
        )}
      </header>

      <main className="flex-1 px-0 pb-4">
        {!ready ? (
          <p className="px-4 py-10 text-sm text-muted-foreground">
            {tCommon("loading")}
          </p>
        ) : items.length > 0 ? (
          <ListenSession
            title={t("offlineTitle")}
            items={items}
            compact
          />
        ) : (
          <p
            className={cn(
              "px-4 py-10 text-center text-sm text-muted-foreground",
            )}
          >
            {t("pwaEmptyHint")}
          </p>
        )}
      </main>
    </div>
  );
}

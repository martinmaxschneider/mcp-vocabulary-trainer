"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  Headphones,
  Loader2,
} from "lucide-react";
import { DailyPackageStatus } from "@prisma/client";
import { api } from "~/trpc/client";
import { ListenSession } from "~/components/listen-session";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useFocusLang } from "~/components/focus-lang-provider";
import { useToast } from "~/hooks/use-toast";
import { TARGET_LANGS, getTargetLang } from "~/lib/languages";
import { toDailyListenItem } from "~/lib/daily-listen";
import {
  hydrateOfflineItems,
  loadOfflineDaily,
  revokeBlobUrls,
  saveDailyOffline,
  type OfflineDailyRecord,
} from "~/lib/offline-daily";
import {
  MOCK_OFFLINE_ITEMS,
  MOCK_OFFLINE_RECORD,
} from "~/lib/offline-daily-mock";
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

type DownloadState =
  | { phase: "idle" }
  | { phase: "saving"; done: number; total: number }
  | { phase: "done" };

export function DailyPwa() {
  const t = useTranslations("daily");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("languages");
  const tToasts = useTranslations("toasts");
  const locale = useLocale();
  const { focusLang, setFocusLang } = useFocusLang();
  const { toast } = useToast();
  const utils = api.useUtils();

  const [downloadState, setDownloadState] = useState<DownloadState>({
    phase: "idle",
  });
  const [ready, setReady] = useState(true);
  const [record, setRecord] = useState<OfflineDailyRecord | null>(
    MOCK_OFFLINE_RECORD,
  );
  const [hydrated, setHydrated] = useState<OfflineDailyRecord["items"] | null>(
    MOCK_OFFLINE_ITEMS,
  );
  const blobUrlsRef = useRef<string[]>([]);
  const doneTimerRef = useRef<number | null>(null);

  const applyRecord = useCallback(async (stored: OfflineDailyRecord | null) => {
    revokeBlobUrls(blobUrlsRef.current);
    blobUrlsRef.current = [];
    if (!stored) {
      setRecord(null);
      setHydrated(null);
      return;
    }
    if (stored.packageId === "mock-daily") {
      setRecord(stored);
      setHydrated(stored.items);
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
      try {
        const stored = (await loadOfflineDaily()) ?? MOCK_OFFLINE_RECORD;
        if (cancelled) return;
        await applyRecord(stored);
      } catch {
        if (!cancelled) await applyRecord(MOCK_OFFLINE_RECORD);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      revokeBlobUrls(blobUrlsRef.current);
      blobUrlsRef.current = [];
      if (doneTimerRef.current != null) {
        window.clearTimeout(doneTimerRef.current);
      }
    };
  }, [applyRecord]);

  const items = useMemo(
    () => (hydrated ?? []).map(toDailyListenItem),
    [hydrated],
  );

  const saving = downloadState.phase === "saving";

  const download = async () => {
    if (saving) return;
    setDownloadState({ phase: "saving", done: 0, total: 0 });
    try {
      const data = await utils.daily.today.fetch({ targetLang: focusLang });
      const pkg = data.package;
      if (!pkg || !canStorePackage(pkg)) {
        setDownloadState({ phase: "idle" });
        toast({ title: t("pwaNeedActive"), variant: "destructive" });
        return;
      }
      const saved = await saveDailyOffline(
        {
          id: pkg.id,
          date: pkg.date,
          targetLang: pkg.targetLang,
          items: pkg.items,
        },
        (done, total) => setDownloadState({ phase: "saving", done, total }),
      );
      await applyRecord(saved);
      setDownloadState({ phase: "done" });
      toast({ title: tToasts("dailyOfflineSaved") });
      doneTimerRef.current = window.setTimeout(
        () => setDownloadState({ phase: "idle" }),
        2500,
      );
    } catch (error) {
      setDownloadState({ phase: "idle" });
      toast({
        title: tToasts("dailyOfflineError"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  const currentLang = getTargetLang(focusLang);
  const isMock = record?.packageId === "mock-daily";
  const savingPercent =
    downloadState.phase === "saving" && downloadState.total > 0
      ? Math.round((downloadState.done / downloadState.total) * 100)
      : null;

  const statusLine = !record
    ? t("pwaEmptyHint")
    : `${isMock ? "Demo · " : ""}${t("offlineHint", {
        date: formatDailyDate(record.date, locale),
      })}`;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-11 gap-1.5 px-2.5 [touch-action:manipulation]"
                aria-label={t("pwaLangLabel")}
              >
                <span aria-hidden className="text-xl leading-none">
                  {currentLang?.flag}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {TARGET_LANGS.map((lang) => (
                <DropdownMenuItem
                  key={lang.code}
                  className="cursor-pointer gap-2 py-2.5"
                  onClick={() => setFocusLang(lang.code)}
                >
                  <span aria-hidden>{lang.flag}</span>
                  <span className="flex-1">{tLang(lang.code)}</span>
                  <Check
                    className={cn(
                      "h-4 w-4",
                      lang.code === focusLang ? "opacity-100" : "opacity-0",
                    )}
                  />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
              <Headphones className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {t("offlineTitle")}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {statusLine}
            </p>
          </div>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="relative h-11 w-11 shrink-0 rounded-full [touch-action:manipulation]"
            onClick={() => void download()}
            disabled={saving}
            aria-label={t("pwaDownload")}
          >
            {downloadState.phase === "saving" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : downloadState.phase === "done" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <Download className="h-5 w-5" />
            )}
          </Button>
        </div>
        {downloadState.phase === "saving" ? (
          <div className="h-0.5 w-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-300"
              style={{ width: `${savingPercent ?? 5}%` }}
            />
          </div>
        ) : null}
      </header>

      <main className="flex-1 pb-4">
        {!ready ? (
          <p className="px-4 py-10 text-sm text-muted-foreground">
            {tCommon("loading")}
          </p>
        ) : items.length > 0 ? (
          <ListenSession title={t("offlineTitle")} items={items} compact />
        ) : (
          <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <Headphones className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t("pwaEmptyHint")}</p>
            <Button
              className="h-12 px-6 [touch-action:manipulation]"
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
          </div>
        )}
      </main>
    </div>
  );
}

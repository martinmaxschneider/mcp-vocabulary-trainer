"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Download, Headphones, Loader2, Smartphone } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { useToast } from "~/hooks/use-toast";
import type { DailyListenSource } from "~/lib/daily-listen";
import {
  loadOfflineDaily,
  saveDailyOffline,
  type OfflineDailyRecord,
} from "~/lib/offline-daily";

function formatDailyDate(date: string, locale: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DailyOfflineCard({
  pkg,
}: {
  pkg: {
    id: string;
    date: string;
    targetLang: string;
    status: string;
    items: DailyListenSource[];
  } | null;
}) {
  const t = useTranslations("daily");
  const tToasts = useTranslations("toasts");
  const locale = useLocale();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [saved, setSaved] = useState<OfflineDailyRecord | null>(null);

  useEffect(() => {
    void loadOfflineDaily().then(setSaved);
  }, []);

  const canSave = pkg?.status === "ACTIVE" && pkg.items.some((item) => item.clips.length > 0);

  const save = async () => {
    if (!pkg || !canSave) return;
    setSaving(true);
    setProgress({ done: 0, total: 0 });
    try {
      const record = await saveDailyOffline(
        {
          id: pkg.id,
          date: pkg.date,
          targetLang: pkg.targetLang,
          items: pkg.items,
        },
        (done, total) => setProgress({ done, total }),
      );
      setSaved(record);
      toast({ title: tToasts("dailyOfflineSaved") });
    } catch (error) {
      toast({
        title: tToasts("dailyOfflineError"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Smartphone className="h-4 w-4" />
          {t("offlineTitle")}
        </CardTitle>
        <CardDescription>{t("offlineCardHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {saved ? (
          <p className="text-sm text-muted-foreground">
            {t("offlineSavedMeta", {
              date: new Date(saved.savedAt).toLocaleString(locale),
              packageDate: formatDailyDate(saved.date, locale),
            })}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t("offlineEmptyShort")}</p>
        )}
        {saving && progress ? (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{t("offlineProgress", progress)}</span>
            </div>
            <Progress
              value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0}
            />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save()} disabled={!canSave || saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {saving ? t("savingOffline") : t("saveOffline")}
          </Button>
          <Button asChild variant="outline">
            <Link href="/daily/offline">
              <Headphones className="mr-2 h-4 w-4" />
              {t("openOffline")}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { ScrollText } from "lucide-react";
import { api } from "~/trpc/client";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

function formatUsd(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

export function SettingsUsageLog() {
  const t = useTranslations("settings");
  const { data: logs, isLoading } = api.settings.listUsageLogs.useQuery();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5" />
          <CardTitle>{t("aiLogsTitle")}</CardTitle>
        </div>
        <CardDescription>{t("aiLogsDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("aiLogsLoading")}</p>
        ) : !logs?.length ? (
          <p className="text-sm text-muted-foreground">{t("aiLogsEmpty")}</p>
        ) : (
          <div className="cahier-section space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="cahier-item space-y-1 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {log.kind === "CHAT"
                        ? t("aiKindChat")
                        : log.kind === "EMBEDDING"
                          ? t("aiKindEmbedding")
                          : t("aiKindTts")}
                    </Badge>
                    <Badge
                      variant={log.status === "OK" ? "secondary" : "destructive"}
                    >
                      {log.status === "OK" ? t("aiStatusOk") : t("aiStatusError")}
                    </Badge>
                    <span className="text-sm font-medium">{log.model}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    {t("aiLogsCost")}: {formatUsd(log.costUsd)}
                  </span>
                  {log.totalTokens != null ? (
                    <span>
                      {t("aiLogsTokens")}: {log.totalTokens}
                    </span>
                  ) : null}
                  {log.characters != null ? (
                    <span>
                      {t("aiLogsChars")}: {log.characters}
                    </span>
                  ) : null}
                </div>
                {log.error ? (
                  <p className="text-sm text-red-600">{log.error}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

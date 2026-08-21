"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";

interface StatsWidgetProps {
  title: string;
  value: string | number;
  total?: number;
  description?: string;
  icon?: React.ReactNode;
  href?: string;
  disabled?: boolean;
  pulse?: boolean;
}

export function StatsWidget({
  title,
  value,
  total,
  description,
  icon,
  href,
  disabled,
  pulse,
}: StatsWidgetProps) {
  const t = useTranslations("dashboard");
  const numericValue = typeof value === "number" ? value : null;
  const percent =
    numericValue != null && total != null && total > 0
      ? Math.round((numericValue / total) * 100)
      : null;
  const clickable = Boolean(href) && !disabled;
  const shouldPulse =
    !disabled &&
    numericValue != null &&
    numericValue > 0 &&
    (pulse || clickable);

  const card = (
    <Card
      className={cn(
        "flex h-full flex-col",
        clickable && "cahier-start-card",
        shouldPulse && "cahier-start-card-pulse",
        disabled && "opacity-60",
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="text-2xl font-bold tabular-nums">
          {value}
          {total != null ? (
            <span className="font-semibold text-muted-foreground">
              {" "}
              / {total}
            </span>
          ) : null}
        </div>
        {percent != null ? (
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--cahier-ink)]/20"
            title={`${percent}%`}
          >
            <div
              className="h-1.5 rounded-full bg-[var(--cahier-ink)]"
              style={{ width: `${Math.min(100, percent)}%` }}
            />
          </div>
        ) : null}
        {description || percent != null || clickable ? (
          <p className="relative mt-auto grid pt-1.5 text-xs text-muted-foreground">
            <span
              className={cn(
                "col-start-1 row-start-1",
                clickable &&
                  "transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0",
              )}
            >
              {description}
              {description && percent != null ? " · " : null}
              {percent != null ? `${percent}%` : null}
            </span>
            {clickable ? (
              <span className="col-start-1 row-start-1 font-medium text-[var(--cahier-ink)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {t("startNow")}
              </span>
            ) : null}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );

  if (!href || disabled) {
    return <div className="h-full">{card}</div>;
  }

  return (
    <Link
      href={href}
      className="group block h-full rounded-[1rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cahier-ink)] focus-visible:ring-offset-2"
    >
      {card}
    </Link>
  );
}

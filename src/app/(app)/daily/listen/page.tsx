"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { DailyItemType } from "@prisma/client";
import { api } from "~/trpc/client";
import { ListenSession } from "~/components/listen-session";
import { Button } from "~/components/ui/button";
import { useFocusLang } from "~/components/focus-lang-provider";
import { toDailyListenItem } from "~/lib/daily-listen";

type PlayerFilter = "all" | DailyItemType;

export default function DailyListenPage() {
  const t = useTranslations("daily");
  const tCommon = useTranslations("common");
  const { focusLang } = useFocusLang();
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = api.useUtils();
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>("all");
  const packageId = searchParams.get("id");

  const pkgQuery = api.daily.getPackage.useQuery(
    packageId ? { id: packageId } : { targetLang: focusLang },
  );
  const startTest = api.daily.startTest.useMutation();
  const pkg = pkgQuery.data ?? null;

  const items = useMemo(() => {
    const source = pkg?.items ?? [];
    return source
      .filter((item) => playerFilter === "all" || item.itemType === playerFilter)
      .map(toDailyListenItem);
  }, [pkg?.items, playerFilter]);

  if (pkgQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>;
  }

  if (!pkg || pkg.status !== "ACTIVE") {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
        <h1 className="text-2xl font-bold">{t("playerTitle")}</h1>
        <p className="text-muted-foreground">{t("listenUnavailable")}</p>
        <Button asChild>
          <Link href="/daily">{t("backToOverview")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <ListenSession
      title={t("playerTitle")}
      subtitle={t("playerHint")}
      items={items}
      backHref="/daily"
      backLabel={tCommon("back")}
      actions={
        <Button
          onClick={async () => {
            await startTest.mutateAsync({ id: pkg.id });
            await Promise.all([
              utils.daily.today.invalidate({ targetLang: focusLang }),
              utils.daily.getPackage.invalidate({ id: pkg.id }),
            ]);
            router.push(`/daily?id=${pkg.id}`);
          }}
          disabled={startTest.isPending}
        >
          {t("startTest")}
        </Button>
      }
      filters={
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", t("filterAll")],
              ["SATZ", t("filterSatz")],
              ["ENTRY", t("filterVocab")],
              ["CONJUGATION", t("filterConj")],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={playerFilter === value ? "default" : "outline"}
              onClick={() => setPlayerFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      }
    />
  );
}

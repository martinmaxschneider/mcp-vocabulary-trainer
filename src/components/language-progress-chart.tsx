import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";

interface LanguageProgressChartProps {
  data: Array<{
    language: string;
    languageName: string;
    boxes: {
      new: number;
      box1: number;
      box2: number;
      box3: number;
      box4: number;
      box5: number;
      box6: number;
    };
    total: number;
    mastered: number;
    masteryPercentage: number;
  }>;
}

type BoxKey = keyof LanguageProgressChartProps["data"][number]["boxes"];

const BOX_COLORS: Record<BoxKey, string> = {
  new: "bg-gray-400 dark:bg-gray-500",
  box1: "bg-red-400",
  box2: "bg-orange-400",
  box3: "bg-yellow-400",
  box4: "bg-lime-400",
  box5: "bg-green-400",
  box6: "bg-emerald-500",
};

export async function LanguageProgressChart({ data }: LanguageProgressChartProps) {
  const t = await getTranslations("progressChart");

  const segments: Array<{ key: BoxKey; fullLabel: string }> = [
    { key: "new", fullLabel: t("boxNew") },
    { key: "box1", fullLabel: t("box1") },
    { key: "box2", fullLabel: t("box2") },
    { key: "box3", fullLabel: t("box3") },
    { key: "box4", fullLabel: t("box4") },
    { key: "box5", fullLabel: t("box5") },
    { key: "box6", fullLabel: t("box6") },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {data.map((lang) => (
          <div key={lang.language} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{lang.languageName}</span>
                <Badge variant="outline">{lang.language.toUpperCase()}</Badge>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                {t("mastery", {
                  percent: lang.masteryPercentage,
                  mastered: lang.mastered,
                  total: lang.total,
                })}
              </div>
            </div>

            <div className="flex h-8 w-full overflow-hidden rounded-md border">
              {segments.map(({ key, fullLabel }) => {
                const count = lang.boxes[key];
                if (count === 0 || lang.total === 0) return null;

                const percentage = (count / lang.total) * 100;
                const showLabel = percentage >= 6;

                return (
                  <div
                    key={key}
                    className={cn(
                      BOX_COLORS[key],
                      "flex shrink-0 items-center justify-center",
                    )}
                    style={{ width: `${percentage}%` }}
                    title={`${fullLabel}: ${count}`}
                  >
                    {showLabel ? (
                      <span className="text-xs font-semibold text-white drop-shadow-sm">
                        {count}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>

          </div>
        ))}

        <div className="border-t pt-4">
          <div className="mb-2 text-xs font-medium">{t("leitnerBoxesTitle")}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {segments.map(({ key, fullLabel }) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={cn("h-3 w-3 rounded-sm", BOX_COLORS[key])} />
                <span>{fullLabel}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

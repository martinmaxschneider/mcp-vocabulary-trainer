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

export async function LanguageProgressChart({ data }: LanguageProgressChartProps) {
  const t = await getTranslations("progressChart");

  // Color scheme for boxes (gradient from red to green)
  const boxColors: Record<string, string> = {
    new: "bg-gray-300",
    box1: "bg-red-400",
    box2: "bg-orange-400",
    box3: "bg-yellow-400",
    box4: "bg-lime-400",
    box5: "bg-green-400",
    box6: "bg-emerald-500",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {data.map((lang) => (
          <div key={lang.language} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium">{lang.languageName}</span>
                <Badge variant="outline">{lang.language.toUpperCase()}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {t("mastery", {
                  percent: lang.masteryPercentage,
                  mastered: lang.mastered,
                  total: lang.total,
                })}
              </div>
            </div>

            {/* Horizontal stacked bar */}
            <div className="h-8 w-full flex rounded-md overflow-hidden border">
              {Object.entries(lang.boxes).map(([box, count]) => {
                const percentage =
                  lang.total > 0 ? (count / lang.total) * 100 : 0;
                if (percentage === 0) return null;

                return (
                  <div
                    key={box}
                    className={cn(boxColors[box], "relative group")}
                    style={{ width: `${percentage}%` }}
                  >
                    {/* Tooltip on hover */}
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      {count}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend for this language */}
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{t("legendNew", { count: lang.boxes.new })}</span>
              <span>
                {t("legendBox1to3", {
                  count: lang.boxes.box1 + lang.boxes.box2 + lang.boxes.box3,
                })}
              </span>
              <span className="font-semibold text-green-600">
                {t("legendBox4to6", {
                  count: lang.boxes.box4 + lang.boxes.box5 + lang.boxes.box6,
                })}
              </span>
            </div>
          </div>
        ))}

        {/* Global legend */}
        <div className="pt-4 border-t">
          <div className="text-xs font-medium mb-2">{t("leitnerBoxesTitle")}</div>
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-gray-300" />
              <span>{t("boxNew")}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-red-400" />
              <span>{t("box1")}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-orange-400" />
              <span>{t("box2")}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-yellow-400" />
              <span>{t("box3")}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-lime-400" />
              <span>{t("box4")}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-green-400" />
              <span>{t("box5")}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-emerald-500" />
              <span>{t("box6")}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

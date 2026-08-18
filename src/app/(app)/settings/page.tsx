"use client";

import { Suspense, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useToast } from "~/hooks/use-toast";
import { api } from "~/trpc/client";
import {
  CheckCircle2,
  Globe,
  AlertTriangle,
  Trash2,
  Loader2,
  Languages,
  Palette,
  Flame,
} from "lucide-react";
import { getLeitnerIntervalsForDisplay } from "~/lib/leitner";
import { SOURCE_LANG, TARGET_LANGS } from "~/lib/languages";
import { isSettingsTab } from "~/lib/ai-settings";
import { setLocale } from "~/app/actions/set-locale";
import {
  localeNativeNames,
  locales,
  type Locale,
} from "~/i18n/config";
import { resolveErrorCode } from "~/lib/trpc-error";
import { ThemeToggle } from "~/components/theme-toggle";
import { Input } from "~/components/ui/input";
import { PronunciationGuideSettings } from "~/components/pronunciation-guide-settings";
import { EmbeddingsSettings } from "~/components/embeddings-settings";
import { AppUpdateCard } from "~/components/app-update-card";
import { SettingsAiPanel } from "~/components/settings-ai-panel";
import { SettingsUsageLog } from "~/components/settings-usage-log";

function SettingsPageInner() {
  const t = useTranslations("settings");
  const tLang = useTranslations("languages");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("toasts");
  const tErrors = useTranslations("errors.codes");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [resetting, setResetting] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [dailyGoalDraft, setDailyGoalDraft] = useState<string>("");

  const rawTab = searchParams.get("tab");
  const tab = isSettingsTab(rawTab) ? rawTab : "general";

  const utils = api.useUtils();
  const { data: gameStatus } = api.gamification.getStatus.useQuery();

  const learningLanguages = [
    {
      code: SOURCE_LANG.code,
      name: tLang(SOURCE_LANG.code),
      role: tLang("sourceRole"),
    },
    ...TARGET_LANGS.map((l) => ({
      code: l.code,
      name: tLang(l.code),
      role:
        l.code === "gsw" ? tLang("targetDialectRole") : tLang("targetRole"),
    })),
  ];

  const resetOptions = [
    {
      id: "progress",
      title: t("resetProgressTitle"),
      description: t("resetProgressDesc"),
      danger: "medium",
    },
    {
      id: "entries",
      title: t("resetEntriesTitle"),
      description: t("resetEntriesDesc"),
      danger: "high",
    },
    {
      id: "domains",
      title: t("resetDomainsTitle"),
      description: t("resetDomainsDesc"),
      danger: "medium",
    },
    {
      id: "everything",
      title: t("resetEverythingTitle"),
      description: t("resetEverythingDesc"),
      danger: "critical",
    },
  ] as const;

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrors(code as "NOT_FOUND") : message;
  };

  const setDailyGoal = api.gamification.setDailyGoal.useMutation({
    onSuccess: async () => {
      toast({ title: t("dailyGoalSaved") });
      await utils.gamification.getStatus.invalidate();
    },
    onError: (error) => {
      toast({
        title: tCommon("error"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const resetProgressMutation = api.settings.resetProgress.useMutation({
    onSuccess: () => {
      toast({
        title: tToasts("progressReset"),
        description: tToasts("progressResetDesc"),
      });
      void utils.invalidate();
      setResetting(null);
    },
    onError: (error) => {
      toast({
        title: tToasts("progressResetError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
      setResetting(null);
    },
  });

  const resetEntriesMutation = api.settings.resetEntries.useMutation({
    onSuccess: () => {
      toast({
        title: tToasts("entriesReset"),
        description: tToasts("entriesResetDesc"),
      });
      void utils.invalidate();
      setResetting(null);
    },
    onError: (error) => {
      toast({
        title: tToasts("resetError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
      setResetting(null);
    },
  });

  const resetDomainsMutation = api.settings.resetDomains.useMutation({
    onSuccess: () => {
      toast({
        title: tToasts("domainsReset"),
        description: tToasts("domainsResetDesc"),
      });
      void utils.invalidate();
      setResetting(null);
    },
    onError: (error) => {
      toast({
        title: tToasts("resetError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
      setResetting(null);
    },
  });

  const resetEverythingMutation = api.settings.resetEverything.useMutation({
    onSuccess: () => {
      toast({
        title: tToasts("everythingReset"),
        description: tToasts("everythingResetDesc"),
      });
      void utils.invalidate();
      setResetting(null);
    },
    onError: (error) => {
      toast({
        title: tToasts("resetError"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
      setResetting(null);
    },
  });

  const handleReset = (optionId: string) => {
    setResetting(optionId);

    switch (optionId) {
      case "progress":
        resetProgressMutation.mutate();
        break;
      case "entries":
        resetEntriesMutation.mutate();
        break;
      case "domains":
        resetDomainsMutation.mutate();
        break;
      case "everything":
        resetEverythingMutation.mutate();
        break;
    }
  };

  const handleLocaleChange = (next: string) => {
    startTransition(async () => {
      const result = await setLocale(next);
      if (result) {
        router.refresh();
      }
    });
  };

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "general") {
      params.delete("tab");
    } else {
      params.set("tab", value);
    }
    const query = params.toString();
    router.replace(query ? `/settings?${query}` : "/settings", { scroll: false });
  };

  const getDangerColor = (danger: string) => {
    switch (danger) {
      case "medium":
        return "border-orange-500/50 bg-orange-500/5";
      case "high":
        return "border-red-500/50 bg-red-500/5";
      case "critical":
        return "border-red-600/50 bg-red-600/10";
      default:
        return "";
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="mb-6 flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="general">{t("tabGeneral")}</TabsTrigger>
          <TabsTrigger value="learning">{t("tabLearning")}</TabsTrigger>
          <TabsTrigger value="ai">{t("tabAi")}</TabsTrigger>
          <TabsTrigger value="logs">{t("tabLogs")}</TabsTrigger>
          <TabsTrigger value="system">{t("tabSystem")}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                <CardTitle>{t("themeTitle")}</CardTitle>
              </div>
              <CardDescription>{t("themeDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ThemeToggle variant="buttons" />
              <p className="text-sm text-muted-foreground">{t("themeHelp")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5" />
                <CardTitle>{t("dailyGoalTitle")}</CardTitle>
              </div>
              <CardDescription>{t("dailyGoalDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="daily-goal-xp">
                  {t("dailyGoalLabel")}
                </label>
                <Input
                  id="daily-goal-xp"
                  type="number"
                  min={10}
                  max={2000}
                  className="w-32"
                  value={dailyGoalDraft || String(gameStatus?.dailyGoalXp ?? 50)}
                  onChange={(event) => setDailyGoalDraft(event.target.value)}
                />
              </div>
              <Button
                type="button"
                disabled={setDailyGoal.isPending}
                onClick={() => {
                  const value = Number(dailyGoalDraft || gameStatus?.dailyGoalXp || 50);
                  setDailyGoal.mutate({ dailyGoalXp: value });
                }}
              >
                {tCommon("save")}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                <CardTitle>{t("nativeLanguage")}</CardTitle>
              </div>
              <CardDescription>{t("nativeLanguageDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between cahier-item p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="font-medium">{tLang(SOURCE_LANG.code)}</div>
                    <div className="text-sm text-muted-foreground">
                      {tLang("sourceRole")}
                    </div>
                  </div>
                </div>
                <Badge variant="secondary">{SOURCE_LANG.code.toUpperCase()}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("nativeLanguageHelp")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Languages className="h-5 w-5" />
                <CardTitle>{t("uiLanguage")}</CardTitle>
              </div>
              <CardDescription>{t("uiLanguageDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={locale}
                onValueChange={handleLocaleChange}
                disabled={isPending}
              >
                <SelectTrigger className="max-w-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locales.map((code) => (
                    <SelectItem key={code} value={code}>
                      {localeNativeNames[code as Locale]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">{t("uiLanguageHelp")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                <CardTitle>{t("languages")}</CardTitle>
              </div>
              <CardDescription>{t("languagesDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="cahier-section space-y-3">
                {learningLanguages.map((lang) => (
                  <div
                    key={lang.code}
                    className="flex items-center justify-between cahier-item p-4"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <div>
                        <div className="font-medium">{lang.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {lang.role}
                        </div>
                      </div>
                    </div>
                    <Badge variant="secondary">{lang.code.toUpperCase()}</Badge>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {t("languagesFutureNote")}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="learning" className="space-y-6">
          <EmbeddingsSettings />
          <PronunciationGuideSettings />
          <Card>
            <CardHeader>
              <CardTitle>{t("leitner")}</CardTitle>
              <CardDescription>{t("leitnerDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="cahier-section space-y-2">
                {getLeitnerIntervalsForDisplay().map((interval) => (
                  <div
                    key={interval.box}
                    className="flex items-center justify-between cahier-item p-3"
                  >
                    <span className="font-medium">
                      {t("leitnerBox", { number: interval.box })}
                    </span>
                    <Badge variant="outline">
                      {interval.days === 0
                        ? t("leitnerImmediate")
                        : t("leitnerDays", { count: interval.days })}
                    </Badge>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {t("leitnerHelp")}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai">
          <SettingsAiPanel />
        </TabsContent>

        <TabsContent value="logs">
          <SettingsUsageLog />
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <AppUpdateCard />

          <Card className="border border-red-500/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <CardTitle className="text-red-600">{t("dangerZone")}</CardTitle>
              </div>
              <CardDescription>{t("dangerZoneDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="cahier-section space-y-4">
                {resetOptions.map((option) => (
                  <div
                    key={option.id}
                    className={`flex items-center justify-between cahier-item p-4 ${getDangerColor(option.danger)}`}
                  >
                    <div className="flex-1">
                      <div className="mb-1 font-medium">{option.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {option.description}
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={resetting !== null}
                        >
                          {resetting === option.id ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {t("resetting")}
                            </>
                          ) : (
                            <>
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t("resetButton")}
                            </>
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("confirmDescription", {
                              title: option.title,
                              description: option.description,
                            })}
                            <br />
                            <br />
                            <strong className="text-red-600">
                              {t("confirmIrreversible")}
                            </strong>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleReset(option.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            {option.id === "everything"
                              ? t("confirmDeleteEverything")
                              : t("confirmDeleteProgress")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{t("backupTip")}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function SettingsPage() {
  const tCommon = useTranslations("common");
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">{tCommon("loading")}</p>}
    >
      <SettingsPageInner />
    </Suspense>
  );
}

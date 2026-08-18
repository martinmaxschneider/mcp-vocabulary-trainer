"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Bot, Check, ChevronDown, KeyRound, Volume2, Wallet } from "lucide-react";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/client";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";
import {
  DEFAULT_TTS_PROFILES,
  defaultTtsProfile,
  type TtsLangProfile,
  type TtsProfiles,
} from "~/lib/ai-settings";
import { SOURCE_LANG, TTS_LANGS, type LearningLangCode } from "~/lib/languages";
import { voicesForLang } from "~/lib/tts-voices";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Progress } from "~/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";

const FALLBACK_VOICES = ["am_onyx", "af_nova", "am_adam", "af_bella"];

function formatUsd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function modelLabel(option: { id: string; name: string }) {
  return option.name === option.id ? option.id : `${option.name} (${option.id})`;
}

function ModelSelect({
  value,
  options,
  onValueChange,
  disabled,
}: {
  value: string;
  options: { id: string; name: string }[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("settings");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const list = options.some((option) => option.id === value)
      ? options
      : value
        ? [{ id: value, name: value }, ...options]
        : options;
    return [...list].sort((a, b) =>
      modelLabel(a).localeCompare(modelLabel(b), undefined, { sensitivity: "base" }),
    );
  }, [options, value]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((option) => {
      const label = modelLabel(option).toLowerCase();
      return (
        label.includes(needle) ||
        option.id.toLowerCase().includes(needle) ||
        option.name.toLowerCase().includes(needle)
      );
    });
  }, [items, query]);

  const selected = items.find((option) => option.id === value);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 w-full justify-between font-normal"
          disabled={disabled}
        >
          <span className="truncate">
            {selected ? modelLabel(selected) : value}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] overflow-hidden p-0"
      >
        <div className="border-b p-2" onKeyDown={(event) => event.stopPropagation()}>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("aiModelSearch")}
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              {t("aiModelSearchEmpty")}
            </p>
          ) : (
            filtered.map((option) => (
              <DropdownMenuItem
                key={option.id}
                className="gap-2"
                onSelect={() => onValueChange(option.id)}
              >
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    option.id === value ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="truncate">{modelLabel(option)}</span>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function VoiceSelect({
  value,
  voices,
  onValueChange,
}: {
  value: string;
  voices: string[];
  onValueChange: (value: string) => void;
}) {
  const items = voices.includes(value) || !value ? voices : [value, ...voices];
  return (
    <Select value={value} onValueChange={onValueChange} disabled={items.length === 0}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {items.map((voice) => (
          <SelectItem key={voice} value={voice}>
            {voice}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SettingsAiPanel() {
  const t = useTranslations("settings");
  const tLang = useTranslations("languages");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const utils = api.useUtils();

  const { data: ai } = api.settings.getAi.useQuery();
  const { data: models } = api.settings.listModels.useQuery();
  const { data: budget } = api.settings.getBudget.useQuery();

  const defaultLang = SOURCE_LANG.code;
  const [chatModel, setChatModel] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [ttsProfiles, setTtsProfiles] = useState<TtsProfiles>(DEFAULT_TTS_PROFILES);
  const [ttsLang, setTtsLang] = useState<LearningLangCode>(defaultLang);
  const [testLang, setTestLang] = useState<LearningLangCode>(defaultLang);
  const [testText, setTestText] = useState("");
  const [testModel, setTestModel] = useState("");
  const [testVoice, setTestVoice] = useState("");

  useEffect(() => {
    if (!ai) return;
    setChatModel(ai.chatModel);
    setEmbeddingModel(ai.embeddingModel);
    if (ai.ttsProfiles) setTtsProfiles(ai.ttsProfiles);
  }, [ai]);

  useEffect(() => {
    const row = ttsProfiles[testLang] ?? defaultTtsProfile(testLang);
    setTestModel(row.model);
    setTestVoice(row.voiceAnswer);
    // Prefill only when the test language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testLang]);

  const speechModels = models?.speech ?? [];

  const voicesFor = (modelId: string, lang: string, extras: string[] = []) => {
    const fromModel = speechModels.find((model) => model.id === modelId)?.voices ?? [];
    const source =
      fromModel.length > 0
        ? fromModel
        : [...FALLBACK_VOICES, ...extras.filter(Boolean)];
    return voicesForLang([...new Set(source)], lang);
  };

  const testVoices = useMemo(
    () => voicesFor(testModel, testLang, [testVoice]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [testModel, testLang, testVoice, speechModels],
  );

  useEffect(() => {
    const fromModel = speechModels.find((model) => model.id === testModel)?.voices ?? [];
    if (fromModel.length === 0 || testVoices.length === 0) return;
    if (!testVoices.includes(testVoice)) {
      setTestVoice(testVoices[0] ?? "");
    }
  }, [speechModels, testModel, testVoices, testVoice]);

  function updateProfile(lang: string, patch: Partial<TtsLangProfile>) {
    setTtsProfiles((current) => {
      const base = current[lang] ?? defaultTtsProfile(lang);
      return { ...current, [lang]: { ...base, ...patch } };
    });
  }

  const errorDescription = (message: string) => {
    const code = resolveErrorCode(message);
    return code ? tErrors(code as "NOT_FOUND") : message;
  };

  const saveAi = api.settings.updateAi.useMutation({
    onSuccess: async () => {
      toast({ title: t("aiSaved") });
      await Promise.all([
        utils.settings.getAi.invalidate(),
        utils.settings.getBudget.invalidate(),
      ]);
    },
    onError: (error) => {
      toast({
        title: tCommon("error"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const testTts = api.settings.testTts.useMutation({
    onSuccess: (data) => {
      const bytes = Uint8Array.from(atob(data.audioBase64), (char) =>
        char.charCodeAt(0),
      );
      const url = URL.createObjectURL(new Blob([bytes], { type: data.mimeType }));
      const audio = new Audio(url);
      void audio.play().finally(() => {
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      });
    },
    onError: (error) => {
      toast({
        title: tCommon("error"),
        description: errorDescription(error.message),
        variant: "destructive",
      });
    },
  });

  const key = budget?.key;
  const remaining = key?.limitRemaining;
  const limit = key?.limit;
  const usedRatio =
    limit != null && limit > 0 && remaining != null
      ? Math.min(100, Math.max(0, ((limit - remaining) / limit) * 100))
      : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              <CardTitle>{t("aiKeyTitle")}</CardTitle>
            </div>
            <CardDescription>{t("aiKeyDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={budget?.configured ? "secondary" : "destructive"}>
                {budget?.configured ? t("aiKeyConfigured") : t("aiKeyMissing")}
              </Badge>
              {key?.label ? (
                <span className="text-sm text-muted-foreground">{key.label}</span>
              ) : null}
            </div>
            {budget?.error === "unavailable" || models?.error === "unavailable" ? (
              <p className="text-sm text-muted-foreground">{t("aiModelsUnavailable")}</p>
            ) : null}
            {models?.error === "not_configured" ? (
              <p className="text-sm text-muted-foreground">{t("aiKeyHelp")}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              <CardTitle>{t("aiBudgetTitle")}</CardTitle>
            </div>
            <CardDescription>{t("aiBudgetDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-semibold">
              {remaining == null
                ? t("aiBudgetUnlimited")
                : formatUsd(remaining)}
            </div>
            {limit != null ? (
              <p className="text-sm text-muted-foreground">
                {t("aiBudgetLimit", { amount: formatUsd(limit) })}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("aiBudgetNone")}</p>
            )}
            {usedRatio != null ? <Progress value={usedRatio} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("aiUsageTitle")}</CardTitle>
            <CardDescription>{t("aiUsageDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">{t("aiUsageToday")}</div>
              <div className="font-medium">{formatUsd(key?.usageDaily)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">{t("aiUsageWeek")}</div>
              <div className="font-medium">{formatUsd(key?.usageWeekly)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">{t("aiUsageMonth")}</div>
              <div className="font-medium">{formatUsd(key?.usageMonthly)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">{t("aiUsageTotal")}</div>
              <div className="font-medium">{formatUsd(key?.usage)}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("aiProjectTitle")}</CardTitle>
            <CardDescription>{t("aiProjectDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">{t("aiProjectToday")}</div>
              <div className="font-medium">
                {formatUsd(budget?.project.todayCostUsd)}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("aiProjectCalls", { count: budget?.project.todayCount ?? 0 })}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">{t("aiProjectTotal")}</div>
              <div className="font-medium">
                {formatUsd(budget?.project.totalCostUsd)}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("aiProjectCalls", { count: budget?.project.totalCount ?? 0 })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <CardTitle>{t("aiModelsTitle")}</CardTitle>
          </div>
          <CardDescription>{t("aiModelsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("aiChatModel")}</label>
            <ModelSelect
              value={chatModel}
              options={models?.chat ?? []}
              onValueChange={setChatModel}
              disabled={!chatModel}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("aiEmbeddingModel")}</label>
            <ModelSelect
              value={embeddingModel}
              options={models?.embedding ?? []}
              onValueChange={setEmbeddingModel}
              disabled={!embeddingModel}
            />
            <p className="text-sm text-muted-foreground">{t("aiEmbeddingModelHelp")}</p>
          </div>
          <Button
            type="button"
            disabled={saveAi.isPending || !chatModel}
            onClick={() =>
              saveAi.mutate({
                chatModel,
                embeddingModel,
              })
            }
          >
            {tCommon("save")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            <CardTitle>{t("aiTtsTitle")}</CardTitle>
          </div>
          <CardDescription>{t("aiTtsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("aiTtsHelp")}</p>
          <Tabs
            value={ttsLang}
            onValueChange={(value) => setTtsLang(value as LearningLangCode)}
          >
            <TabsList className="flex h-auto flex-wrap justify-start gap-1">
              {TTS_LANGS.map((lang) => (
                <TabsTrigger key={lang.code} value={lang.code}>
                  {lang.flag} {tLang(lang.code)}
                </TabsTrigger>
              ))}
            </TabsList>
            {TTS_LANGS.map((lang) => {
              const row = ttsProfiles[lang.code] ?? defaultTtsProfile(lang.code);
              const voices = voicesFor(row.model, lang.code, [
                row.voiceQuestion,
                row.voiceAnswer,
              ]);
              return (
                <TabsContent key={lang.code} value={lang.code} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("aiTtsModel")}</label>
                    <ModelSelect
                      value={row.model}
                      options={speechModels}
                      onValueChange={(model) => {
                        const fromModel =
                          speechModels.find((item) => item.id === model)?.voices ?? [];
                        if (fromModel.length === 0) {
                          updateProfile(lang.code, { model });
                          return;
                        }
                        const nextVoices = voicesForLang([...new Set(fromModel)], lang.code);
                        updateProfile(lang.code, {
                          model,
                          voiceQuestion: nextVoices.includes(row.voiceQuestion)
                            ? row.voiceQuestion
                            : (nextVoices[0] ?? row.voiceQuestion),
                          voiceAnswer: nextVoices.includes(row.voiceAnswer)
                            ? row.voiceAnswer
                            : (nextVoices[1] ?? nextVoices[0] ?? row.voiceAnswer),
                        });
                      }}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("aiTtsVoiceQuestion")}</label>
                      <VoiceSelect
                        value={row.voiceQuestion}
                        voices={voices}
                        onValueChange={(voiceQuestion) =>
                          updateProfile(lang.code, { voiceQuestion })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("aiTtsVoiceAnswer")}</label>
                      <VoiceSelect
                        value={row.voiceAnswer}
                        voices={voices}
                        onValueChange={(voiceAnswer) =>
                          updateProfile(lang.code, { voiceAnswer })
                        }
                      />
                    </div>
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
          <Button
            type="button"
            disabled={saveAi.isPending}
            onClick={() => saveAi.mutate({ ttsProfiles })}
          >
            {tCommon("save")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            <CardTitle>{t("aiTestTitle")}</CardTitle>
          </div>
          <CardDescription>{t("aiTestDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("aiTestLang")}</label>
            <Select
              value={testLang}
              onValueChange={(value) => setTestLang(value as LearningLangCode)}
            >
              <SelectTrigger className="max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TTS_LANGS.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.flag} {tLang(lang.code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="tts-test-text">
              {t("aiTestText")}
            </label>
            <Input
              id="tts-test-text"
              value={testText}
              onChange={(event) => setTestText(event.target.value)}
              placeholder={t("aiTestPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("aiTtsModel")}</label>
            <ModelSelect
              value={testModel}
              options={speechModels}
              onValueChange={setTestModel}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("aiTestVoice")}</label>
            <VoiceSelect
              value={testVoice}
              voices={testVoices}
              onValueChange={setTestVoice}
            />
          </div>
          <Button
            type="button"
            disabled={testTts.isPending || !testText.trim() || !testVoice}
            onClick={() =>
              testTts.mutate({
                text: testText.trim(),
                voice: testVoice,
                model: testModel || undefined,
                lang: testLang,
              })
            }
          >
            {testTts.isPending ? t("aiTestPlaying") : t("aiTestButton")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

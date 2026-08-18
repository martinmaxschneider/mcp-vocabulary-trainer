"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Bot, KeyRound, Volume2, Wallet } from "lucide-react";
import { api } from "~/trpc/client";
import { useToast } from "~/hooks/use-toast";
import { resolveErrorCode } from "~/lib/trpc-error";
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
import { Progress } from "~/components/ui/progress";

const FALLBACK_VOICES = ["onyx", "nova", "alloy", "echo", "fable", "shimmer"];

function formatUsd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
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
  const items = options.some((option) => option.id === value)
    ? options
    : value
      ? [{ id: value, name: value }, ...options]
      : options;

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {items.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name === option.id ? option.id : `${option.name} (${option.id})`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SettingsAiPanel() {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors.codes");
  const { toast } = useToast();
  const utils = api.useUtils();

  const { data: ai } = api.settings.getAi.useQuery();
  const { data: models } = api.settings.listModels.useQuery();
  const { data: budget } = api.settings.getBudget.useQuery();

  const [chatModel, setChatModel] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [ttsModel, setTtsModel] = useState("");
  const [ttsVoiceQuestion, setTtsVoiceQuestion] = useState("");
  const [ttsVoiceAnswer, setTtsVoiceAnswer] = useState("");
  const [testText, setTestText] = useState("");
  const [testVoice, setTestVoice] = useState("");

  useEffect(() => {
    if (!ai) return;
    setChatModel(ai.chatModel);
    setEmbeddingModel(ai.embeddingModel);
    setTtsModel(ai.ttsModel);
    setTtsVoiceQuestion(ai.ttsVoiceQuestion);
    setTtsVoiceAnswer(ai.ttsVoiceAnswer);
    setTestVoice((current) => current || ai.ttsVoiceAnswer);
  }, [ai]);

  const speechVoices = useMemo(() => {
    const fromModel =
      models?.speech.find((model) => model.id === ttsModel)?.voices ?? [];
    const voices = fromModel.length > 0 ? fromModel : FALLBACK_VOICES;
    return [...new Set(voices)];
  }, [models?.speech, ttsModel]);

  useEffect(() => {
    if (speechVoices.length === 0) return;
    if (!speechVoices.includes(ttsVoiceQuestion)) {
      setTtsVoiceQuestion(speechVoices[0] ?? "");
    }
    if (!speechVoices.includes(ttsVoiceAnswer)) {
      setTtsVoiceAnswer(speechVoices[1] ?? speechVoices[0] ?? "");
    }
    if (!speechVoices.includes(testVoice)) {
      setTestVoice(speechVoices[0] ?? "");
    }
  }, [speechVoices, ttsVoiceQuestion, ttsVoiceAnswer, testVoice]);

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
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("aiTtsModel")}</label>
            <ModelSelect
              value={ttsModel}
              options={models?.speech ?? []}
              onValueChange={setTtsModel}
              disabled={!ttsModel}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("aiTtsVoiceQuestion")}</label>
              <Select value={ttsVoiceQuestion} onValueChange={setTtsVoiceQuestion}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {speechVoices.map((voice) => (
                    <SelectItem key={voice} value={voice}>
                      {voice}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("aiTtsVoiceAnswer")}</label>
              <Select value={ttsVoiceAnswer} onValueChange={setTtsVoiceAnswer}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {speechVoices.map((voice) => (
                    <SelectItem key={voice} value={voice}>
                      {voice}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            type="button"
            disabled={saveAi.isPending || !chatModel}
            onClick={() =>
              saveAi.mutate({
                chatModel,
                embeddingModel,
                ttsModel,
                ttsVoiceQuestion,
                ttsVoiceAnswer,
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
            <CardTitle>{t("aiTestTitle")}</CardTitle>
          </div>
          <CardDescription>{t("aiTestDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
            <label className="text-sm font-medium">{t("aiTestVoice")}</label>
            <Select value={testVoice} onValueChange={setTestVoice}>
              <SelectTrigger className="max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {speechVoices.map((voice) => (
                  <SelectItem key={voice} value={voice}>
                    {voice}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            disabled={testTts.isPending || !testText.trim() || !testVoice}
            onClick={() =>
              testTts.mutate({
                text: testText.trim(),
                voice: testVoice,
                model: ttsModel || undefined,
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

import { AiUsageKind, AiUsageStatus } from "@prisma/client";
import OpenAI from "openai";
import { env } from "~/env";
import { logAiUsage, usageCost } from "~/server/services/ai-usage";
import {
  getChatModel,
  getEmbeddingModel,
  getTtsSettings,
} from "~/server/services/ai-settings";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_NOT_CONFIGURED = "OpenRouter API key is not configured";

const APP_HEADERS = {
  "HTTP-Referer": "https://sprachen.app",
  "X-Title": "Sprachen",
};

let cachedClient: OpenAI | null = null;

export function isOpenRouterConfigured(): boolean {
  return Boolean(env.OPENROUTER_API_KEY);
}

export function getOpenRouter(): OpenAI {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error(OPENROUTER_NOT_CONFIGURED);
  }
  cachedClient ??= new OpenAI({
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: APP_HEADERS,
  });
  return cachedClient;
}

async function openRouterFetch(path: string): Promise<Response> {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error(OPENROUTER_NOT_CONFIGURED);
  }
  return fetch(`${OPENROUTER_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      ...APP_HEADERS,
    },
    cache: "no-store",
  });
}

export type OpenRouterKeyInfo = {
  label: string;
  limit: number | null;
  limitRemaining: number | null;
  usage: number;
  usageDaily: number;
  usageWeekly: number;
  usageMonthly: number;
  isFreeTier: boolean;
};

export async function getOpenRouterKeyInfo(): Promise<OpenRouterKeyInfo> {
  const response = await openRouterFetch("/key");
  if (!response.ok) {
    throw new Error(`OpenRouter key request failed (${response.status})`);
  }
  const json = (await response.json()) as {
    data?: {
      label?: string;
      limit?: number | null;
      limit_remaining?: number | null;
      usage?: number;
      usage_daily?: number;
      usage_weekly?: number;
      usage_monthly?: number;
      is_free_tier?: boolean;
    };
  };
  const data = json.data ?? {};
  return {
    label: data.label ?? "",
    limit: data.limit ?? null,
    limitRemaining: data.limit_remaining ?? null,
    usage: data.usage ?? 0,
    usageDaily: data.usage_daily ?? 0,
    usageWeekly: data.usage_weekly ?? 0,
    usageMonthly: data.usage_monthly ?? 0,
    isFreeTier: Boolean(data.is_free_tier),
  };
}

export type OpenRouterModelOption = {
  id: string;
  name: string;
  voices: string[];
};

type OpenRouterModelRow = {
  id?: string;
  name?: string;
  supported_voices?: string[];
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
};

function toModelOption(row: OpenRouterModelRow): OpenRouterModelOption | null {
  if (!row.id) return null;
  return {
    id: row.id,
    name: row.name ?? row.id,
    voices: Array.isArray(row.supported_voices) ? row.supported_voices : [],
  };
}

async function fetchModels(query = ""): Promise<OpenRouterModelOption[]> {
  const response = await openRouterFetch(`/models${query}`);
  if (!response.ok) {
    throw new Error(`OpenRouter models request failed (${response.status})`);
  }
  const json = (await response.json()) as { data?: OpenRouterModelRow[] };
  return (json.data ?? [])
    .map(toModelOption)
    .filter((model): model is OpenRouterModelOption => model !== null);
}

export async function listOpenRouterModels(): Promise<{
  chat: OpenRouterModelOption[];
  embedding: OpenRouterModelOption[];
  speech: OpenRouterModelOption[];
}> {
  const [all, speech] = await Promise.all([
    fetchModels(),
    fetchModels("?output_modalities=speech").catch(() => [] as OpenRouterModelOption[]),
  ]);

  const chat: OpenRouterModelOption[] = [];
  const embedding: OpenRouterModelOption[] = [];

  for (const model of all) {
    const id = model.id.toLowerCase();
    if (id.includes("embed")) {
      embedding.push(model);
      continue;
    }
    chat.push(model);
  }

  const speechIds = new Set(speech.map((model) => model.id));
  const speechList =
    speech.length > 0
      ? speech
      : all.filter(
          (model) =>
            model.id.toLowerCase().includes("tts") ||
            model.voices.length > 0,
        );

  return {
    chat: chat.filter((model) => !speechIds.has(model.id)),
    embedding,
    speech: speechList,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function createChatCompletion(
  params: Omit<OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, "model"> & {
    model?: string;
  },
): Promise<OpenAI.Chat.ChatCompletion> {
  const model = params.model ?? (await getChatModel());
  try {
    const completion = await getOpenRouter().chat.completions.create({
      ...params,
      model,
    });
    await logAiUsage({
      kind: AiUsageKind.CHAT,
      model,
      generationId: completion.id,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
      costUsd: usageCost(completion.usage),
      status: AiUsageStatus.OK,
    });
    return completion;
  } catch (error) {
    await logAiUsage({
      kind: AiUsageKind.CHAT,
      model,
      status: AiUsageStatus.ERROR,
      error: errorMessage(error),
    });
    throw error;
  }
}

export async function createEmbedding(input: string[]): Promise<number[][]> {
  const model = await getEmbeddingModel();
  try {
    const response = await getOpenRouter().embeddings.create({
      model,
      input,
    });
    await logAiUsage({
      kind: AiUsageKind.EMBEDDING,
      model,
      promptTokens: response.usage?.prompt_tokens,
      totalTokens: response.usage?.total_tokens,
      costUsd: usageCost(response.usage),
      status: AiUsageStatus.OK,
    });
    return [...response.data]
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  } catch (error) {
    await logAiUsage({
      kind: AiUsageKind.EMBEDDING,
      model,
      status: AiUsageStatus.ERROR,
      error: errorMessage(error),
    });
    throw error;
  }
}

export async function createSpeechMp3(params: {
  text: string;
  voice: string;
  model?: string;
}): Promise<Buffer> {
  const model = params.model ?? (await getTtsSettings()).model;
  try {
    const response = await getOpenRouter().audio.speech.create({
      model,
      voice: params.voice as "alloy",
      input: params.text,
      response_format: "mp3",
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    await logAiUsage({
      kind: AiUsageKind.TTS,
      model,
      characters: params.text.length,
      status: AiUsageStatus.OK,
    });
    return buffer;
  } catch (error) {
    await logAiUsage({
      kind: AiUsageKind.TTS,
      model,
      characters: params.text.length,
      status: AiUsageStatus.ERROR,
      error: errorMessage(error),
    });
    throw error;
  }
}

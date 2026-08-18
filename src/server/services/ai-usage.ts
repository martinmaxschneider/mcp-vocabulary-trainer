import { AiUsageKind, AiUsageStatus } from "@prisma/client";
import { db } from "~/server/db";

export type LogAiUsageInput = {
  kind: AiUsageKind;
  model: string;
  generationId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  characters?: number | null;
  costUsd?: number | null;
  status: AiUsageStatus;
  error?: string | null;
};

function truncateError(error: string | null | undefined): string | null {
  if (!error) return null;
  return error.length > 500 ? error.slice(0, 497) + "…" : error;
}

export function usageCost(usage: unknown): number | null {
  if (!usage || typeof usage !== "object") return null;
  const cost = (usage as { cost?: unknown }).cost;
  return typeof cost === "number" && Number.isFinite(cost) ? cost : null;
}

export async function logAiUsage(input: LogAiUsageInput): Promise<void> {
  try {
    await db.aiUsageLog.create({
      data: {
        kind: input.kind,
        model: input.model,
        generationId: input.generationId ?? null,
        promptTokens: input.promptTokens ?? null,
        completionTokens: input.completionTokens ?? null,
        totalTokens: input.totalTokens ?? null,
        characters: input.characters ?? null,
        costUsd: input.costUsd ?? null,
        status: input.status,
        error: truncateError(input.error),
      },
    });
  } catch (error) {
    console.error("Failed to log AI usage:", error);
  }
}

export async function listAiUsageLogs(limit = 50) {
  return db.aiUsageLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

function startOfUtcDay(): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export async function getProjectUsageSummary() {
  const today = startOfUtcDay();
  const [todayAgg, totalAgg] = await Promise.all([
    db.aiUsageLog.aggregate({
      where: { createdAt: { gte: today }, status: AiUsageStatus.OK },
      _sum: { costUsd: true },
      _count: true,
    }),
    db.aiUsageLog.aggregate({
      where: { status: AiUsageStatus.OK },
      _sum: { costUsd: true },
      _count: true,
    }),
  ]);

  return {
    todayCostUsd: todayAgg._sum.costUsd ?? 0,
    todayCount: todayAgg._count,
    totalCostUsd: totalAgg._sum.costUsd ?? 0,
    totalCount: totalAgg._count,
  };
}

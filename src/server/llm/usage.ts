import { db } from "../db";
import { DailyQuotaExceededError } from "./errors";
import { estimateLLMCostUsd } from "./pricing";
import type { LLMProvider } from "./types";

type UsageAggregateResult = {
  _sum?: {
    totalTokens: number | null;
    costUsd: number | null;
  };
};

type UsageReadAdapter = {
  aggregate(args: unknown): Promise<UsageAggregateResult>;
};

type UsageWriteAdapter = {
  create(args: unknown): Promise<{ id: string } & Record<string, unknown>>;
};

type DailyUsageTotals = {
  userTotalTokens: number;
  userCostEstimate: number;
  projectTotalTokens: number;
  projectCostEstimate: number;
};

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function getDailyLimitConfig() {
  return {
    userTokenLimit: parsePositiveNumber(process.env.LLM_DAILY_TOKEN_LIMIT_PER_USER, 50_000),
    projectTokenLimit: parsePositiveNumber(process.env.LLM_DAILY_TOKEN_LIMIT_PER_PROJECT, 100_000),
    userCostLimitUsd: parsePositiveNumber(process.env.LLM_DAILY_COST_LIMIT_USD_PER_USER, 2),
    projectCostLimitUsd: parsePositiveNumber(process.env.LLM_DAILY_COST_LIMIT_USD_PER_PROJECT, 5),
  };
}

function sanitizeTokenCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

export function getUtcDayRange(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { start, end };
}

export async function getDailyUsageTotals(args: {
  userId: string;
  projectId: string;
  now?: Date;
}): Promise<DailyUsageTotals> {
  const { start, end } = getUtcDayRange(args.now);

  // Casts keep CI typecheck stable when local Prisma Client is not regenerated yet.
  const usageReader = db.usage as unknown as UsageReadAdapter;

  const [userUsage, projectUsage] = await Promise.all([
    usageReader.aggregate({
      where: {
        userId: args.userId,
        createdAt: {
          gte: start,
          lt: end,
        },
      },
      _sum: {
        totalTokens: true,
        costUsd: true,
      },
    }),
    usageReader.aggregate({
      where: {
        projectId: args.projectId,
        createdAt: {
          gte: start,
          lt: end,
        },
      },
      _sum: {
        totalTokens: true,
        costUsd: true,
      },
    }),
  ]);

  return {
    userTotalTokens: userUsage?._sum?.totalTokens ?? 0,
    userCostEstimate: userUsage?._sum?.costUsd ?? 0,
    projectTotalTokens: projectUsage?._sum?.totalTokens ?? 0,
    projectCostEstimate: projectUsage?._sum?.costUsd ?? 0,
  };
}

export async function assertDailyLLMQuota(args: { userId: string; projectId: string; now?: Date }) {
  const usageTotals = await getDailyUsageTotals(args);
  const limits = getDailyLimitConfig();

  if (usageTotals.userTotalTokens >= limits.userTokenLimit) {
    throw new DailyQuotaExceededError({
      userId: args.userId,
      projectId: args.projectId,
      reason: "User daily token quota exceeded",
    });
  }

  if (usageTotals.projectTotalTokens >= limits.projectTokenLimit) {
    throw new DailyQuotaExceededError({
      userId: args.userId,
      projectId: args.projectId,
      reason: "Project daily token quota exceeded",
    });
  }

  if (usageTotals.userCostEstimate >= limits.userCostLimitUsd) {
    throw new DailyQuotaExceededError({
      userId: args.userId,
      projectId: args.projectId,
      reason: "User daily cost quota exceeded",
    });
  }

  if (usageTotals.projectCostEstimate >= limits.projectCostLimitUsd) {
    throw new DailyQuotaExceededError({
      userId: args.userId,
      projectId: args.projectId,
      reason: "Project daily cost quota exceeded",
    });
  }
}

export async function recordLLMUsage(args: {
  runId?: string;
  userId: string;
  projectId: string;
  provider: LLMProvider | string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const promptTokens = sanitizeTokenCount(args.inputTokens);
  const completionTokens = sanitizeTokenCount(args.outputTokens);
  const totalTokens = promptTokens + completionTokens;

  const provider = args.provider.trim();
  const model = args.model.trim();

  const costUsd = estimateLLMCostUsd({
    provider: args.provider as LLMProvider,
    model,
    inputTokens: promptTokens,
    outputTokens: completionTokens,
  });

  // Usage write errors intentionally fail the call for MVP observability guarantees.
  const usageWriter = db.usage as unknown as UsageWriteAdapter;

  return usageWriter.create({
    data: {
      runId: args.runId,
      userId: args.userId,
      projectId: args.projectId,
      provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
    },
  });
}

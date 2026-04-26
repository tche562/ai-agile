import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import {
  LLMConfigurationError,
  LLMRateLimitError,
  type LLMProvider,
  type LLMRateLimitInfo,
} from "./types";

type RatelimitResponseLike = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

type EnforceLLMRateLimitArgs = {
  userId?: string;
  projectId?: string;
  provider?: LLMProvider;
  enabled?: boolean;
};

type LimitFunction = (identifier: string) => Promise<RatelimitResponseLike>;

type UpstashDuration = Parameters<typeof Ratelimit.slidingWindow>[1];

let llmRatelimit: Ratelimit | undefined;

export function isLLMRateLimitEnabled(): boolean {
  const raw = process.env.LLM_RATELIMIT_ENABLED?.toLowerCase();

  if (raw === "false" || raw === "0" || raw === "off") {
    return false;
  }

  if (raw === "true" || raw === "1" || raw === "on") {
    return true;
  }

  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export function resolveLLMRateLimitRequests(): number {
  const raw = Number(process.env.LLM_RATELIMIT_REQUESTS ?? "5");

  if (!Number.isFinite(raw) || raw <= 0) {
    return 5;
  }

  return Math.floor(raw);
}

export function resolveLLMRateLimitWindow(): UpstashDuration {
  return (process.env.LLM_RATELIMIT_WINDOW || "1 m") as UpstashDuration;
}

export function buildLLMRateLimitIdentifier(args: { userId?: string; projectId?: string }): string {
  if (!args.userId) {
    throw new LLMConfigurationError("Missing meta.userId for LLM rate limiting.");
  }

  if (!args.projectId) {
    throw new LLMConfigurationError("Missing meta.projectId for LLM rate limiting.");
  }

  return `llm:user:${args.userId}:project:${args.projectId}`;
}

export function getLLMRatelimit(): Ratelimit {
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    throw new LLMConfigurationError("Missing UPSTASH_REDIS_REST_URL.");
  }

  if (!process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new LLMConfigurationError("Missing UPSTASH_REDIS_REST_TOKEN.");
  }

  if (!llmRatelimit) {
    llmRatelimit = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(resolveLLMRateLimitRequests(), resolveLLMRateLimitWindow()),
      analytics: true,
      prefix: "ai-agile:ratelimit:llm",
    });
  }

  return llmRatelimit;
}

export async function enforceLLMRateLimitWithLimitFn(
  args: EnforceLLMRateLimitArgs,
  limitFn: LimitFunction,
): Promise<LLMRateLimitInfo | undefined> {
  const enabled = args.enabled ?? true;

  if (!enabled) {
    return undefined;
  }

  const identifier = buildLLMRateLimitIdentifier({
    userId: args.userId,
    projectId: args.projectId,
  });

  const response = await limitFn(identifier);

  const info: LLMRateLimitInfo = {
    identifier,
    limit: response.limit,
    remaining: response.remaining,
    reset: response.reset,
  };

  if (!response.success) {
    throw new LLMRateLimitError({
      provider: args.provider,
      identifier,
      limit: response.limit,
      remaining: response.remaining,
      reset: response.reset,
      retryAfterSeconds: calculateRetryAfterSeconds(response.reset),
    });
  }

  return info;
}

export async function enforceLLMRateLimit(
  args: Omit<EnforceLLMRateLimitArgs, "enabled">,
): Promise<LLMRateLimitInfo | undefined> {
  const enabled = isLLMRateLimitEnabled();

  if (!enabled) {
    return undefined;
  }

  const ratelimit = getLLMRatelimit();

  return enforceLLMRateLimitWithLimitFn(
    {
      ...args,
      enabled,
    },
    async (identifier) => {
      const response = await ratelimit.limit(identifier);

      return {
        success: response.success,
        limit: response.limit,
        remaining: response.remaining,
        reset: response.reset,
      };
    },
  );
}

export function calculateRetryAfterSeconds(reset: number): number {
  return Math.max(1, Math.ceil((reset - Date.now()) / 1000));
}

export function createRateLimitHeaders(info: LLMRateLimitInfo): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(info.limit),
    "X-RateLimit-Remaining": String(info.remaining),
    "X-RateLimit-Reset": String(info.reset),
  };
}

export function createRateLimitErrorHeaders(error: LLMRateLimitError): Record<string, string> {
  return {
    "Retry-After": String(error.retryAfterSeconds),
    "X-RateLimit-Limit": String(error.limit),
    "X-RateLimit-Remaining": String(error.remaining),
    "X-RateLimit-Reset": String(error.reset),
  };
}

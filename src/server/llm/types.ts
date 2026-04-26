import { z } from "zod";

export type LLMProvider = "openai" | "anthropic";

export type LLMGenerateJSONMeta = {
  userId?: string;
  projectId?: string;
  runId?: string;
  model?: string;
  temperature?: number;

  /**
   * Maximum retry count after the first failed parse/schema validation.
   * MVP hard limit is 2.
   */
  maxRetries?: number;
};

export type GenerateJSONParams<TSchema extends z.ZodTypeAny> = {
  system: string;
  user: string;
  schema: TSchema;
  meta?: LLMGenerateJSONMeta;
};

export type LLMUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type LLMRateLimitInfo = {
  identifier: string;
  limit: number;
  remaining: number;
  reset: number;
};

export type RawLLMResponse = {
  rawText: string;
  usage?: LLMUsage;
};

export type LLMRetryContext = {
  /**
   * 1-based attempt number.
   * Example: attempt 1 is the first call, attempt 2 is the first retry.
   */
  attempt: number;
  maxAttempts: number;
  previousError?: string;
  previousRawText?: string;
};

export type LLMFailedAttempt = {
  attempt: number;
  rawText: string;
  error: string;
};

export type GenerateJSONResult<TSchema extends z.ZodTypeAny> = {
  object: z.infer<TSchema>;
  rawText: string;
  provider: LLMProvider;
  model: string;
  usage?: LLMUsage;
  rateLimit?: LLMRateLimitInfo;

  /**
   * Total attempts used, including the successful attempt.
   */
  attempts: number;

  /**
   * Number of retries used.
   */
  retryCount: number;
};

export class LLMOutputParseError extends Error {
  provider: LLMProvider;
  model: string;
  rawText: string;

  constructor(args: { provider: LLMProvider; model: string; rawText: string; message?: string }) {
    super(args.message ?? "Failed to parse model output as valid JSON.");
    this.name = "LLMOutputParseError";
    this.provider = args.provider;
    this.model = args.model;
    this.rawText = args.rawText;
  }
}

export class LLMGenerationFailedError extends Error {
  provider: LLMProvider;
  model: string;
  attempts: LLMFailedAttempt[];

  constructor(args: {
    provider: LLMProvider;
    model: string;
    attempts: LLMFailedAttempt[];
    message?: string;
  }) {
    super(
      args.message ??
        `LLM failed to return schema-valid JSON after ${args.attempts.length} attempt(s).`,
    );
    this.name = "LLMGenerationFailedError";
    this.provider = args.provider;
    this.model = args.model;
    this.attempts = args.attempts;
  }
}

export class LLMRateLimitError extends Error {
  statusCode = 429 as const;
  provider?: LLMProvider;
  identifier: string;
  limit: number;
  remaining: number;
  reset: number;
  retryAfterSeconds: number;

  constructor(args: {
    provider?: LLMProvider;
    identifier: string;
    limit: number;
    remaining: number;
    reset: number;
    retryAfterSeconds: number;
    message?: string;
  }) {
    super(args.message ?? "LLM rate limit exceeded.");
    this.name = "LLMRateLimitError";
    this.provider = args.provider;
    this.identifier = args.identifier;
    this.limit = args.limit;
    this.remaining = args.remaining;
    this.reset = args.reset;
    this.retryAfterSeconds = args.retryAfterSeconds;
  }
}

export class LLMConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMConfigurationError";
  }
}

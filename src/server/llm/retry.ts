import { z } from "zod";
import {
  LLMGenerationFailedError,
  LLMOutputParseError,
  type GenerateJSONResult,
  type LLMFailedAttempt,
  type LLMProvider,
  type LLMRetryContext,
  type RawLLMResponse,
} from "./types";
import { parseAndValidateJson } from "./utils";
import { logRuntimeError } from "../observability/logger";

export const DEFAULT_LLM_MAX_RETRIES = 2;
export const HARD_LLM_MAX_RETRIES = 2;

export function resolveMaxRetries(maxRetries?: number): number {
  if (typeof maxRetries !== "number" || Number.isNaN(maxRetries)) {
    return DEFAULT_LLM_MAX_RETRIES;
  }

  return Math.max(0, Math.min(HARD_LLM_MAX_RETRIES, Math.floor(maxRetries)));
}

export async function generateJSONWithRetry<TSchema extends z.ZodTypeAny>(args: {
  provider: LLMProvider;
  model: string;
  schema: TSchema;
  maxRetries?: number;
  meta?: {
    runId?: string;
    projectId?: string;
    userId?: string;
    purpose?: string;
  };
  generateRawText: (context: LLMRetryContext) => Promise<RawLLMResponse>;
  onParseFailure?: (input: {
    attempt: number;
    maxAttempts: number;
    parseFailureType: "json_parse" | "schema_validation";
    error: LLMOutputParseError;
  }) => void;
}): Promise<GenerateJSONResult<TSchema>> {
  const maxRetries = resolveMaxRetries(args.maxRetries);
  const maxAttempts = maxRetries + 1;

  const failedAttempts: LLMFailedAttempt[] = [];
  let previousError: string | undefined;
  let previousRawText: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await args.generateRawText({
      attempt,
      maxAttempts,
      previousError,
      previousRawText,
    });

    try {
      const object = parseAndValidateJson({
        rawText: response.rawText,
        schema: args.schema,
        provider: args.provider,
        model: args.model,
      });

      return {
        object,
        rawText: response.rawText,
        provider: args.provider,
        model: args.model,
        usage: response.usage,
        attempts: attempt,
        retryCount: attempt - 1,
      };
    } catch (error) {
      if (!(error instanceof LLMOutputParseError)) {
        throw error;
      }

      args.onParseFailure?.({
        attempt,
        maxAttempts,
        parseFailureType: error.message.includes("schema validation")
          ? "schema_validation"
          : "json_parse",
        error,
      });

      previousError = error.message;
      previousRawText = response.rawText;

      failedAttempts.push({
        attempt,
        rawText: response.rawText,
        error: error.message,
      });
    }
  }

  const failure = new LLMGenerationFailedError({
    provider: args.provider,
    model: args.model,
    attempts: failedAttempts,
  });

  logRuntimeError({
    event: "llm_parse_failed",
    message: "LLM output remained invalid after retry budget exhausted",
    context: {
      operation: "llm.generate_json",
      provider: args.provider,
      model: args.model,
      runId: args.meta?.runId,
      projectId: args.meta?.projectId,
      userId: args.meta?.userId,
      purpose: args.meta?.purpose,
      maxAttempts,
      failedAttemptCount: failedAttempts.length,
    },
    error: failure,
  });

  throw failure;
}

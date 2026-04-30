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
  generateRawText: (context: LLMRetryContext) => Promise<RawLLMResponse>;
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

      previousError = error.message;
      previousRawText = response.rawText;

      failedAttempts.push({
        attempt,
        rawText: response.rawText,
        error: error.message,
      });
    }
  }

  throw new LLMGenerationFailedError({
    provider: args.provider,
    model: args.model,
    attempts: failedAttempts,
  });
}

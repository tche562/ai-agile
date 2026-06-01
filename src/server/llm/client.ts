import { z } from "zod";
import type { GenerateJSONParams, GenerateJSONResult, LLMProvider } from "./types";
import { enforceLLMRateLimit } from "./ratelimit";
import { generateJSONWithRetry } from "./retry";
import { assertDailyLLMQuota, recordLLMUsage } from "./usage";
import { buildJsonOnlyPrompt, buildUserPromptForAttempt, extractJsonText } from "./utils";
import { logRuntimeWarning } from "../observability/logger";

export interface LLMClient {
  generateJSON<TSchema extends z.ZodTypeAny>(
    params: GenerateJSONParams<TSchema>,
  ): Promise<GenerateJSONResult<TSchema>>;
}

export type ProviderCallParams = {
  model: string;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
};

export type ProviderCallResult = {
  provider: LLMProvider;
  model: string;
  rawText: string;
  inputTokens: number;
  outputTokens: number;
};

export interface LLMProviderAdapter {
  provider: LLMProvider;
  defaultModel: string;
  generateRawText(params: ProviderCallParams): Promise<ProviderCallResult>;
}

export class GatewayLLMClient implements LLMClient {
  constructor(private readonly adapter: LLMProviderAdapter) {}

  async generateJSON<TSchema extends z.ZodTypeAny>(
    params: GenerateJSONParams<TSchema>,
  ): Promise<GenerateJSONResult<TSchema>> {
    const model = params.meta.model ?? this.adapter.defaultModel;
    const temperature = params.meta.temperature ?? 0;

    let rateLimit;
    try {
      rateLimit = await enforceLLMRateLimit({
        userId: params.meta.userId,
        projectId: params.meta.projectId,
        provider: this.adapter.provider,
      });
    } catch (error) {
      logRuntimeWarning({
        event: "rate_limit_exceeded",
        message: "LLM request blocked by rate limiter",
        context: {
          operation: "llm.generate_json",
          provider: this.adapter.provider,
          model,
          userId: params.meta.userId,
          projectId: params.meta.projectId,
          runId: params.meta.runId,
          purpose: params.meta.purpose,
          statusCode: 429,
        },
        error,
      });
      throw error;
    }

    const { systemPrompt, userPrompt } = buildJsonOnlyPrompt({
      system: params.system,
      user: params.user,
      schema: params.schema,
    });

    const result = await generateJSONWithRetry({
      provider: this.adapter.provider,
      model,
      schema: params.schema,
      maxRetries: params.meta.maxRetries,
      meta: {
        runId: params.meta.runId,
        projectId: params.meta.projectId,
        userId: params.meta.userId,
        purpose: params.meta.purpose,
      },
      onParseFailure: ({ attempt, maxAttempts, parseFailureType, error }) => {
        let schemaIssueCount: number | undefined;
        let schemaFirstIssuePath: string | undefined;

        if (parseFailureType === "schema_validation") {
          try {
            const parsed = JSON.parse(extractJsonText(error.rawText));
            const parsedResult = params.schema.safeParse(parsed);
            if (!parsedResult.success) {
              schemaIssueCount = parsedResult.error.issues.length;
              const firstIssue = parsedResult.error.issues[0];
              schemaFirstIssuePath =
                firstIssue && firstIssue.path.length > 0 ? firstIssue.path.join(".") : "<root>";
            }
          } catch {
            // If this helper parse fails, keep the base parse failure log only.
          }
        }

        logRuntimeWarning({
          event: "llm_parse_failed",
          message: "LLM output failed JSON/schema parsing on attempt",
          context: {
            operation: "llm.generate_json",
            provider: this.adapter.provider,
            model,
            runId: params.meta.runId,
            projectId: params.meta.projectId,
            userId: params.meta.userId,
            purpose: params.meta.purpose,
            attempt,
            maxAttempts,
            parseFailureType,
            schemaIssueCount,
            schemaFirstIssuePath,
          },
          error,
        });
      },
      generateRawText: async (retryContext) => {
        await assertDailyLLMQuota({
          userId: params.meta.userId,
          projectId: params.meta.projectId,
        });

        const providerResult = await this.adapter.generateRawText({
          model,
          temperature,
          systemPrompt,
          userPrompt: buildUserPromptForAttempt({
            userPrompt,
            attempt: retryContext.attempt,
            previousError: retryContext.previousError,
          }),
        });

        await recordLLMUsage({
          runId: params.meta.runId,
          userId: params.meta.userId,
          projectId: params.meta.projectId,
          provider: providerResult.provider,
          model: providerResult.model,
          inputTokens: providerResult.inputTokens,
          outputTokens: providerResult.outputTokens,
        });

        return {
          rawText: providerResult.rawText,
          usage: {
            inputTokens: providerResult.inputTokens,
            outputTokens: providerResult.outputTokens,
            totalTokens: providerResult.inputTokens + providerResult.outputTokens,
          },
        };
      },
    });

    return {
      ...result,
      rateLimit,
    };
  }
}
